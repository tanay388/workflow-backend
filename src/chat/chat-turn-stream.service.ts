import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
} from '../common/queue/run-stream.types';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { RunQueryService } from '../runs/run-query.service';
import { RunService } from '../runs/run.service';
import { WaitService } from '../approvals/wait.service';
import { ConversationService } from './conversation.service';

export type ChatMessageDto = {
  id: string;
  role: string;
  content: string;
  status: string;
  seq: number;
  runId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string | null;
  createdAt: string;
};

export type ChatStreamPayload =
  | {
      type: 'replay';
      run: {
        id: string;
        status: string;
        messageId: string | null;
      };
      steps: Array<{
        id: string;
        nodeId: string;
        nodeType: string;
        nodeLabel: string;
        status: string;
        seq: number;
      }>;
      assistantMessage: ChatMessageDto | null;
    }
  | { type: 'delta'; messageId: string; delta: string }
  | { type: 'message'; message: ChatMessageDto }
  | { type: 'event'; event: RunEvent }
  | { type: 'terminal'; status: string }
  | { type: 'error'; message: string };

@Injectable()
export class ChatTurnStreamService {
  private readonly logger = new Logger(ChatTurnStreamService.name);

  constructor(
    private readonly listen: PgListenClient,
    private readonly runQuery: RunQueryService,
    private readonly runs: RunService,
    private readonly wait: WaitService,
    private readonly conversations: ConversationService,
  ) {}

  messageDto(msg: {
    id: string;
    role: string;
    content: string;
    status: string;
    seq: number;
    runId: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    model: string | null;
    createdAt: Date;
  }): ChatMessageDto {
    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      status: msg.status,
      seq: msg.seq,
      runId: msg.runId,
      inputTokens: msg.inputTokens,
      outputTokens: msg.outputTokens,
      model: msg.model,
      createdAt: msg.createdAt.toISOString(),
    };
  }

  async pipeTurnSse(
    tenancy: Tenancy,
    conversationId: string,
    runId: string,
    res: Response,
    req: Request,
  ): Promise<void> {
    const run = await this.runQuery.getRunForStream(tenancy, runId);
    if (run.conversationId !== conversationId) {
      throw new NotFoundException('Run does not belong to this conversation');
    }

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

    const write = (payload: ChatStreamPayload) => {
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

    const sendAssistantMessage = async (messageId: string | null) => {
      if (!messageId) return;
      const msg = await this.conversations.getMessage(messageId, tenancy.orgId!);
      if (msg) {
        write({ type: 'message', message: this.messageDto(msg) });
      }
    };

    const forward = async (event: RunEvent) => {
      if (event.kind === 'token') {
        const messageId = String(event.messageId ?? '');
        const delta = String(event.delta ?? '');
        if (event.done) {
          await sendAssistantMessage(run.messageId);
          return;
        }
        if (delta && messageId) {
          write({ type: 'delta', messageId, delta });
        }
        return;
      }

      if (!isStreamObservableEvent(event)) return;
      if (!markSeen(event)) return;

      write({ type: 'event', event });

      if (event.kind === 'run' && isTerminalRunStatus(String(event.status))) {
        await sendAssistantMessage(run.messageId);
        write({ type: 'terminal', status: String(event.status) });
        await close();
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
      const steps = await this.runQuery.getStepsForReplay(runId);
      for (const step of steps) {
        const phase = step.endedAt ? 'end' : 'start';
        seen.add(`${step.nodeId}:${step.seq}:${phase}`);
      }

      let assistantMessage: ChatMessageDto | null = null;
      if (run.messageId) {
        const msg = await this.conversations.getMessage(run.messageId, tenancy.orgId!);
        if (msg) assistantMessage = this.messageDto(msg);
      }

      write({
        type: 'replay',
        run: { id: run.id, status: run.status, messageId: run.messageId },
        steps: steps.map((s) => ({
          id: s.id,
          nodeId: s.nodeId,
          nodeType: s.nodeType,
          nodeLabel: s.nodeLabel,
          status: s.status,
          seq: s.seq,
        })),
        assistantMessage,
      });

      client = await this.listen.acquire();
      await client.query(runExecListenSql(channel));

      const onNotify = (msg: { channel?: string; payload?: string }) => {
        if (msg.channel !== channel || !msg.payload) return;
        try {
          const event = JSON.parse(msg.payload) as RunEvent;
          if (!replayDone) buffered.push(event);
          else void forward(event);
        } catch {
          // ignore
        }
      };
      client.on('notification', onNotify);

      replayDone = true;
      for (const event of buffered) await forward(event);
      buffered.length = 0;

      if (isTerminalRunStatus(run.status)) {
        await sendAssistantMessage(run.messageId);
        write({ type: 'terminal', status: run.status });
        await close();
        return;
      }

      res.on('close', () => {
        void close();
      });
    } catch (err) {
      this.logger.warn(`Chat SSE error for run ${runId}: ${String(err)}`);
      write({ type: 'error', message: 'Stream failed' });
      await close();
    }
  }

  async handleControl(
    tenancy: Tenancy,
    conversationId: string,
    frame: { type: string; runId?: string; answer?: string },
  ): Promise<void> {
    const runId = frame.runId;
    if (!runId) return;

    const run = await this.runQuery.getRunForStream(tenancy, runId);
    if (run.conversationId !== conversationId) {
      throw new NotFoundException('Run does not belong to this conversation');
    }

    if (frame.type === 'cancel' || frame.type === 'pause') {
      await this.runs.cancel(tenancy, runId);
      return;
    }
    if (frame.type === 'answer-prompt' && frame.answer) {
      await this.wait.resume(runId, 'continue', {
        data: {
          outcome: 'continue',
          answer: frame.answer,
          resumed_at: new Date().toISOString(),
        },
      });
    }
  }
}
