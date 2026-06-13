import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ComposioService } from '../connections/composio.service';
import { Connection } from '../connections/entities/connection.entity';
import { queryResultRows } from '../common/database/query-result';
import type { WorkflowGraph, WorkflowNode } from '../common/types/graph';
import { delayToResumeAt, localDateTimeToUtc, type DelayUnit } from '../common/utils/time';
import { resumeStateFromJson } from '../engine/resume-state';
import type { ResumeState } from '../engine/engine.types';
import { RunPausedError } from '../engine/engine.types';
import { Workflow } from '../workflows/entities/workflow.entity';
import { WorkflowRun, type WaitMode as RunWaitMode } from '../runs/entities/workflow-run.entity';
import { ActionTokenService } from './action-token.service';
import { ApprovalRequest } from './entities/approval-request.entity';
import { TriggerSubscription } from './entities/trigger-subscription.entity';
import { disableInstanceIfUnshared } from './external-trigger-cleanup.util';
import {
  normalizeWaitMode,
  type WaitOutcome,
  type WaitPauseState,
  type WaitResumeState,
} from './wait.types';

@Injectable()
export class WaitService {
  private readonly logger = new Logger(WaitService.name);

  constructor(
    @InjectRepository(WorkflowRun) private readonly runs: Repository<WorkflowRun>,
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
    @InjectRepository(ApprovalRequest) private readonly approvals: Repository<ApprovalRequest>,
    @InjectRepository(TriggerSubscription) private readonly subscriptions: Repository<TriggerSubscription>,
    @InjectRepository(Connection) private readonly connections: Repository<Connection>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly actionTokens: ActionTokenService,
    private readonly composio: ComposioService,
  ) {}

  async consumeWaitResume(
    runId: string,
    nodeId: string,
  ): Promise<{ port: string; data: unknown } | null> {
    const run = await this.runs.findOne({ where: { id: runId } });
    const preset = resumeStateFromJson(run?.resumeState ?? null);
    const wr = preset?.waitResume;
    if (!wr || wr.nodeId !== nodeId) return null;

    const cleared: ResumeState = { ...preset!, waitResume: undefined };
    await this.runs.update(runId, {
      resumeState: cleared as unknown as WorkflowRun['resumeState'],
    } as Parameters<Repository<WorkflowRun>['update']>[1]);

    return { port: wr.port, data: wr.data ?? { outcome: wr.port, resumed_at: new Date().toISOString() } };
  }

  async enterWait(params: {
    runId: string;
    node: WorkflowNode;
    graph: WorkflowGraph;
    resumeState: ResumeState;
    predecessorNodeId: string | null;
    config: Record<string, unknown>;
    contextPayload?: unknown;
  }): Promise<never> {
    const run = await this.runs.findOne({ where: { id: params.runId } });
    if (!run) throw new Error(`Run ${params.runId} not found`);

    const mode = normalizeWaitMode(params.config.mode as string | undefined);
    let resumeAt: Date | null = null;
    let waitMode: RunWaitMode = 'time_based';
    const waitPause: WaitPauseState = { nodeId: params.node.id, mode };

    if (mode === 'delay') {
      const delay = (params.config.delay as { value?: number; unit?: string }) ?? {};
      const legacySeconds = params.config.duration_seconds as number | undefined;
      const value = delay.value ?? legacySeconds ?? 60;
      const unit = (delay.unit as DelayUnit) ?? 'seconds';
      resumeAt = delayToResumeAt(value, unit);
    } else if (mode === 'until_datetime') {
      const until = (params.config.until as { datetime?: string; timezone?: string }) ?? {};
      const datetime = String(
        until.datetime ?? (params.config.datetime as string | undefined) ?? '',
      ).trim();
      if (!datetime) {
        throw new Error('Wait until datetime requires a datetime value');
      }
      const timezone = until.timezone ?? (params.config.timezone as string) ?? 'UTC';
      resumeAt = localDateTimeToUtc(datetime, timezone);
      if (resumeAt.getTime() <= Date.now()) {
        throw new Error('Wait until datetime must be in the future');
      }
    } else if (mode === 'until_event') {
      waitMode = 'trigger_based';
      const event = (params.config.event as Record<string, unknown>) ?? {};
      const timeoutMinutes = Number(event.timeout_minutes ?? 60);
      resumeAt = new Date(Date.now() + timeoutMinutes * 60_000);
      await this.registerEventBinding(run, params.node, event);
    } else if (mode === 'until_approval') {
      waitMode = 'trigger_based';
      const approvalCfg = (params.config.approval as Record<string, unknown>) ?? {};
      const title =
        (approvalCfg.title as string) ??
        (params.config.message as string) ??
        'Approval required';
      const timeoutMinutes = Number(approvalCfg.timeout_minutes ?? 1440);
      resumeAt = new Date(Date.now() + timeoutMinutes * 60_000);
      const approval = await this.createApproval(run, params.node, title, timeoutMinutes, params.contextPayload);
      waitPause.approvalId = approval.id;
    }

    const pauseState: ResumeState = {
      ...params.resumeState,
      waitPause,
      nextNodeId: params.node.id,
    };

    await this.runs.update(run.id, {
      status: 'paused',
      resumeState: pauseState as unknown as WorkflowRun['resumeState'],
      lastCompletedNodeId: params.predecessorNodeId ?? params.node.id,
      resumeAt,
      waitMode,
      lockedBy: null,
      lockedAt: null,
    } as Parameters<Repository<WorkflowRun>['update']>[1]);

    throw new RunPausedError({ resumeAt, waitMode: waitMode as string });
  }

  /**
   * Guarded exactly-once resume: paused → queued with waitResume port baked in.
   */
  async resume(
    runId: string,
    outcome: WaitOutcome,
    opts?: { approvalId?: string; data?: Record<string, unknown> },
  ): Promise<boolean> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run || run.status !== 'paused') return false;

    const preset = resumeStateFromJson(run.resumeState);
    const waitPause = preset?.waitPause;
    if (!waitPause?.nodeId) {
      return this.guardedRequeueBackoff(runId);
    }

    const waitResume: WaitResumeState = {
      nodeId: waitPause.nodeId,
      port: outcome,
      data: opts?.data ?? { outcome, resumed_at: new Date().toISOString() },
    };

    const newState: ResumeState = {
      input: preset!.input,
      outputs: preset!.outputs,
      vars: preset!.vars,
      waitPause,
      waitResume,
      nextNodeId: waitPause.nodeId,
      cancelRequested: preset?.cancelRequested,
    };

    const result = await this.dataSource.query(
      `
      UPDATE workflow_runs
      SET status = 'queued',
          resume_at = NULL,
          wait_mode = NULL,
          locked_by = NULL,
          locked_at = NULL,
          resume_state = $2::jsonb
      WHERE id = $1 AND status = 'paused'
      RETURNING id
      `,
      [runId, JSON.stringify(newState)],
    );

    const rows = queryResultRows<{ id: string }>(result);
    if (rows.length === 0) return false;

    await this.cleanupEventBinding(runId, waitPause.nodeId);
    await this.dataSource.query(`SELECT pg_notify('run_enqueued', $1)`, [runId]);
    return true;
  }

  async processDuePauses(now = new Date()): Promise<number> {
    let count = 0;

    const expiredApprovals = await this.approvals
      .createQueryBuilder('a')
      .where("a.status = 'pending'")
      .andWhere('a.token_expires_at <= :now', { now })
      .getMany();

    for (const row of expiredApprovals) {
      const upd = await this.approvals
        .createQueryBuilder()
        .update(ApprovalRequest)
        .set({ status: 'expired', consumedAt: now })
        .where('id = :id AND status = :pending', { id: row.id, pending: 'pending' })
        .execute();
      if (upd.affected) {
        if (await this.resume(row.runId, 'timed_out')) count++;
      }
    }

    const dueRuns = await this.runs
      .createQueryBuilder('r')
      .where("r.status = 'paused'")
      .andWhere('r.resume_at IS NOT NULL')
      .andWhere('r.resume_at <= :now', { now })
      .getMany();

    for (const run of dueRuns) {
      const preset = resumeStateFromJson(run.resumeState);
      if (!preset?.waitPause) {
        if (await this.guardedRequeueBackoff(run.id)) count++;
        continue;
      }
      const outcome: WaitOutcome =
        run.waitMode === 'time_based' ? 'continue' : 'timed_out';
      if (await this.resume(run.id, outcome)) count++;
    }

    return count;
  }

  private async guardedRequeueBackoff(runId: string): Promise<boolean> {
    const result = await this.dataSource.query(
      `
      UPDATE workflow_runs
      SET status = 'queued', resume_at = NULL, wait_mode = NULL, locked_by = NULL, locked_at = NULL
      WHERE id = $1 AND status = 'paused'
      RETURNING id
      `,
      [runId],
    );
    const rows = queryResultRows<{ id: string }>(result);
    if (rows.length === 0) return false;
    await this.dataSource.query(`SELECT pg_notify('run_enqueued', $1)`, [runId]);
    return true;
  }

  private async createApproval(
    run: WorkflowRun,
    node: WorkflowNode,
    title: string,
    timeoutMinutes: number,
    payload?: unknown,
  ): Promise<ApprovalRequest> {
    const wf = await this.workflows.findOne({ where: { id: run.workflowId } });
    const expiresAt = new Date(Date.now() + timeoutMinutes * 60_000);
    const row = this.approvals.create({
      orgId: run.orgId,
      workspaceId: run.workspaceId,
      runId: run.id,
      nodeId: node.id,
      title,
      context: {
        workflowId: run.workflowId,
        workflowName: wf?.name ?? 'Workflow',
        runId: run.id,
        nodeId: node.id,
        nodeLabel: node.label,
        title,
        summary: title,
        payload: payload ?? null,
      },
      status: 'pending',
      tokenExpiresAt: expiresAt,
      actionToken: 'pending',
    });
    const saved = await this.approvals.save(row);
    saved.actionToken = this.actionTokens.mint(saved.id);
    return this.approvals.save(saved);
  }

  /**
   * Create the run ↔ trigger binding for an until_event wait and register the
   * Composio trigger instance. Hard-fails the run instead of writing a
   * pending binding: a binding without an external instance id can never be
   * reached by the webhook resolver, so the run would silently sit until its
   * timeout.
   */
  private async registerEventBinding(
    run: WorkflowRun,
    node: WorkflowNode,
    event: Record<string, unknown>,
  ): Promise<void> {
    const toolkit = typeof event.toolkit === 'string' ? event.toolkit.toLowerCase() : '';
    const eventSlug = typeof event.event_slug === 'string' ? event.event_slug : '';
    const connectionId = (event.connection_id as string | null) ?? null;
    const match = asRecord(event.match) ?? {};
    // Instance configuration (what Composio should watch, per the trigger
    // type's config schema) is a different contract from the local payload
    // `match` filter; legacy graphs only had `match`, so fall back to it.
    const triggerConfig = asRecord(event.trigger_config) ?? match;

    if (!toolkit || !eventSlug) {
      throw new Error('Wait "until event" requires a toolkit and event slug');
    }
    if (!connectionId) {
      throw new Error(
        'Wait "until event" requires a connected account — select a connection on the Wait node',
      );
    }
    if (!this.composio.isConfigured()) {
      throw new Error('Composio is not configured on this server (COMPOSIO_API_KEY)');
    }

    const conn = await this.connections.findOne({
      where: {
        id: connectionId,
        orgId: run.orgId,
        workspaceId: run.workspaceId,
        deletedAt: IsNull(),
      },
    });
    if (!conn?.composioConnectionId || conn.status !== 'connected') {
      throw new Error(
        'Wait "until event" connection is not connected — reconnect it on the Connections page',
      );
    }

    let external: { id: string; status?: string };
    try {
      external = await this.composio.upsertTriggerInstance(
        eventSlug,
        conn.composioConnectionId,
        triggerConfig,
      );
    } catch (err) {
      throw new Error(
        `Failed to register Composio trigger ${eventSlug}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const sub = this.subscriptions.create({
      orgId: run.orgId,
      workspaceId: run.workspaceId,
      workflowId: run.workflowId,
      kind: 'composio_event',
      connectedAccountId: connectionId,
      toolkit,
      eventSlug,
      config: {
        run_id: run.id,
        node_id: node.id,
        toolkit,
        event_slug: eventSlug,
        connection_id: connectionId,
        match,
        trigger_config: triggerConfig,
      },
      externalId: external.id,
      status: 'active',
    });

    await this.subscriptions.save(sub);
    this.logger.debug(`Registered event binding ${sub.id} for run ${run.id} node ${node.id}`);
  }

  private async cleanupEventBinding(runId: string, nodeId: string): Promise<void> {
    const rows = await this.subscriptions
      .createQueryBuilder('s')
      .where("s.config->>'run_id' = :runId", { runId })
      .andWhere("s.config->>'node_id' = :nodeId", { nodeId })
      .andWhere('s.deleted_at IS NULL')
      .getMany();

    for (const row of rows) {
      if (row.externalId) {
        const disabled = await disableInstanceIfUnshared(
          this.subscriptions,
          this.composio,
          row.externalId,
          row.id,
        );
        if (!disabled) {
          this.logger.debug(
            `Kept Composio instance ${row.externalId} — still referenced by another subscription`,
          );
        }
      }
      row.status = 'disabled';
      row.deletedAt = new Date();
      await this.subscriptions.save(row);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
