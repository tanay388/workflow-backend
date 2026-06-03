import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Client } from 'pg';
import { PgListenClient } from '../common/database/pg-listen.client';
import type { RunEvent } from '../common/queue/run-event-bus.interface';
import {
  isStreamObservableEvent,
  isTerminalRunStatus,
  runExecChannel,
  runExecListenSql,
  stepDedupeKey,
  type RunStreamPayload,
} from '../common/queue/run-stream.types';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { RunQueryService } from './run-query.service';

@Injectable()
export class RunStreamService {
  private readonly logger = new Logger(RunStreamService.name);

  constructor(
    private readonly listen: PgListenClient,
    private readonly query: RunQueryService,
  ) {}

  async pipeSse(tenancy: Tenancy, runId: string, res: Response, req: Request): Promise<void> {
    let client: Client | null = null;
    const channel = runExecChannel(runId);
    const buffered: RunEvent[] = [];
    const seen = new Set<string>();
    let replayDone = false;
    let closed = false;

    const close = async () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      req.removeListener('close', onAbort);
      req.removeListener('aborted', onAbort);
      if (client) await this.listen.release(client);
      client = null;
      if (!res.writableEnded) res.end();
    };

    const onAbort = () => {
      void close();
    };

    const write = (payload: RunStreamPayload) => {
      if (closed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const markSeen = (event: RunEvent): boolean => {
      const key = stepDedupeKey(event);
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    };

    const forward = (event: RunEvent) => {
      if (!isStreamObservableEvent(event)) return;
      if (!markSeen(event)) return;
      write({ type: 'event', event });
      if (event.kind === 'run' && isTerminalRunStatus(String(event.status))) {
        write({ type: 'terminal', status: String(event.status) });
        void close();
      }
    };

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    req.on('close', onAbort);
    req.on('aborted', onAbort);

    const heartbeat = setInterval(() => {
      if (!closed && !res.writableEnded) res.write(': ping\n\n');
    }, 25_000);

    try {
      client = await this.listen.acquire();
      await client.query(runExecListenSql(channel));

      const onNotify = (msg: { channel?: string; payload?: string }) => {
        if (msg.channel !== channel || !msg.payload) return;
        try {
          const event = JSON.parse(msg.payload) as RunEvent;
          if (!replayDone) buffered.push(event);
          else forward(event);
        } catch {
          // ignore malformed
        }
      };
      client.on('notification', onNotify);

      const run = await this.query.getRunForStream(tenancy, runId);
      const steps = await this.query.getStepsForReplay(runId);

      for (const step of steps) {
        const phase = step.endedAt ? 'end' : 'start';
        seen.add(`${step.nodeId}:${step.seq}:${phase}`);
      }

      write({
        type: 'replay',
        run: {
          id: run.id,
          status: run.status,
          workflowId: run.workflowId,
          triggerSource: run.triggerSource,
          error: run.error,
          startedAt: run.startedAt?.toISOString() ?? null,
          finishedAt: run.finishedAt?.toISOString() ?? null,
        },
        steps: steps.map((s) => ({
          id: s.id,
          nodeId: s.nodeId,
          nodeType: s.nodeType,
          nodeLabel: s.nodeLabel,
          status: s.status,
          seq: s.seq,
          error: s.error,
        })),
      });

      replayDone = true;
      for (const event of buffered) forward(event);
      buffered.length = 0;

      if (isTerminalRunStatus(run.status)) {
        write({ type: 'terminal', status: run.status });
        await close();
        return;
      }

      res.on('close', () => {
        void close();
      });
    } catch (err) {
      this.logger.warn(`SSE stream error for run ${runId}: ${String(err)}`);
      await close();
    }
  }
}
