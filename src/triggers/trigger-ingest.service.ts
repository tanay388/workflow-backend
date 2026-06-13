import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { queryResultRows } from '../common/database/query-result';
import type { WorkflowGraph } from '../common/types/graph';
import { validateRunInput } from '../common/utils/run-input';
import { RUN_QUEUE, type RunQueue } from '../common/queue/run-queue.interface';
import { WaitService } from '../approvals/wait.service';
import { TriggerSubscription } from '../approvals/entities/trigger-subscription.entity';
import { WorkflowRun } from '../runs/entities/workflow-run.entity';
import { matchesEventFilter } from './event-match.util';
import { Workflow } from '../workflows/entities/workflow.entity';
import { WorkflowVersion } from '../workflows/entities/workflow-version.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';

export interface TriggerIngestParams {
  orgId: string;
  source: string;
  idempotencyKey: string;
  workflowId: string;
  workspaceId: string;
  triggerSource: WorkflowRun['triggerSource'];
  input?: unknown;
  runBy?: Record<string, unknown>;
  triggerMetadata?: Record<string, unknown> | null;
  /** Resume these paused runs instead of creating a new one. */
  boundRunIds?: string[] | null;
  /**
   * Whether to start a new run when there are no bound runs to resume.
   * Workflow-level triggers pass true; wait-node bindings pass false so a
   * stale binding can never spawn a fresh run. Defaults to true.
   */
  allowNewRun?: boolean;
}

export interface TriggerIngestResult {
  duplicate: boolean;
  runId: string | null;
  resumed: boolean;
  resumedRunIds: string[];
}

@Injectable()
export class TriggerIngestService {
  private readonly logger = new Logger(TriggerIngestService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(RUN_QUEUE) private readonly runQueue: RunQueue,
    private readonly wait: WaitService,
  ) {}

  async ingest(params: TriggerIngestParams): Promise<TriggerIngestResult> {
    const claim = await this.claimDelivery(params.orgId, params.idempotencyKey, params.source);
    if (claim.duplicate) {
      return { duplicate: true, runId: claim.existingRunId, resumed: false, resumedRunIds: [] };
    }

    const bound = [...new Set(params.boundRunIds ?? [])];
    const resumedRunIds: string[] = [];
    for (const boundRunId of bound) {
      const ok = await this.tryResumePaused(boundRunId, params.orgId, asEventRecord(params.input));
      if (ok) resumedRunIds.push(boundRunId);
    }

    let runId: string | null = resumedRunIds[0] ?? null;

    if (!runId && bound.length > 0) {
      this.logger.warn(
        `Bound resume failed for run(s) ${bound.join(', ')} (source=${params.source}) — not starting a new run`,
      );
      return { duplicate: false, runId: null, resumed: false, resumedRunIds: [] };
    }

    if (!runId && params.allowNewRun !== false) {
      runId = await this.enqueueWorkflowRun(params);
    }

    if (claim.deliveryId && runId) {
      await this.dataSource.getRepository(WebhookDelivery).update(claim.deliveryId, { runId });
    }

    return { duplicate: false, runId, resumed: resumedRunIds.length > 0, resumedRunIds };
  }

  private async claimDelivery(
    orgId: string,
    idempotencyKey: string,
    source: string,
  ): Promise<{ duplicate: boolean; deliveryId: string | null; existingRunId: string | null }> {
    const result = await this.dataSource.query(
      `
      INSERT INTO webhook_deliveries (org_id, idempotency_key, source, received_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (org_id, idempotency_key) DO NOTHING
      RETURNING id, run_id
      `,
      [orgId, idempotencyKey, source],
    );
    const rows = queryResultRows<{ id: string; run_id: string | null }>(result);
    if (rows.length > 0) {
      return { duplicate: false, deliveryId: rows[0]!.id, existingRunId: null };
    }

    const existing = await this.dataSource.getRepository(WebhookDelivery).findOne({
      where: { orgId, idempotencyKey },
    });
    return {
      duplicate: true,
      deliveryId: null,
      existingRunId: existing?.runId ?? null,
    };
  }

  private async tryResumePaused(
    runId: string,
    orgId: string,
    eventData?: Record<string, unknown>,
  ): Promise<boolean> {
    const run = await this.dataSource.getRepository(WorkflowRun).findOne({
      where: { id: runId, orgId },
    });
    if (!run || run.status !== 'paused' || run.waitMode !== 'trigger_based') {
      return false;
    }
    return this.wait.resume(runId, 'continue', {
      data: {
        outcome: 'continue',
        resumed_at: new Date().toISOString(),
        event: eventData ?? null,
        ...(eventData ?? {}),
      },
    });
  }

  private async enqueueWorkflowRun(params: TriggerIngestParams): Promise<string | null> {
    const wf = await this.dataSource.getRepository(Workflow).findOne({
      where: { id: params.workflowId, orgId: params.orgId, workspaceId: params.workspaceId },
    });
    if (!wf?.currentVersionId) {
      this.logger.warn(`Trigger ingest: workflow ${params.workflowId} missing version`);
      return null;
    }

    const version = await this.dataSource.getRepository(WorkflowVersion).findOne({
      where: { id: wf.currentVersionId },
    });
    const graph = version?.graph as WorkflowGraph | undefined;
    const validated = validateRunInput(graph, params.input ?? {}, { mode: 'lenient' });
    if (validated.problems.length > 0) {
      this.logger.warn(
        `Trigger ingest input problems for workflow ${params.workflowId}: ` +
          validated.problems.map((p) => p.message).join('; '),
      );
    }
    const runInput = validated.input;

    const { runId } = await this.runQueue.enqueue({
      orgId: params.orgId,
      workspaceId: params.workspaceId,
      workflowId: params.workflowId,
      workflowVersionId: wf.currentVersionId,
      triggerSource: params.triggerSource,
      runBy: params.runBy,
      input: runInput,
      triggerMetadata: params.triggerMetadata ?? null,
    });

    return runId;
  }

  /** Find paused wait bindings that match an external Composio delivery. */
  async findPausedBindingRuns(
    orgId: string,
    externalId: string,
    payload: Record<string, unknown>,
  ): Promise<string[]> {
    const eventPayload =
      (payload.data as Record<string, unknown>) ??
      (payload.payload as Record<string, unknown>) ??
      payload;

    const subs = await this.dataSource.getRepository(TriggerSubscription).find({
      where: { orgId, externalId, deletedAt: IsNull() },
    });

    const runIds: string[] = [];
    for (const sub of subs) {
      const runId = sub.config?.run_id as string | undefined;
      if (runId && (await this.isPausedTriggerRun(runId, orgId))) {
        runIds.push(runId);
      }
    }
    if (runIds.length > 0) return [...new Set(runIds)];

    const toolkit = String(payload.toolkit ?? payload.toolkit_slug ?? '').toLowerCase();
    const eventSlug = String(
      payload.event_slug ?? payload.trigger_slug ?? payload.triggerSlug ?? '',
    ).toLowerCase();
    if (!toolkit || !eventSlug) return [];

    const waitSubs = await this.dataSource
      .getRepository(TriggerSubscription)
      .createQueryBuilder('s')
      .where('s.org_id = :orgId', { orgId })
      .andWhere('s.deleted_at IS NULL')
      .andWhere("s.config->>'run_id' IS NOT NULL")
      .andWhere("lower(coalesce(s.config->>'toolkit','')) = :toolkit", { toolkit })
      .andWhere("lower(coalesce(s.config->>'event_slug','')) = :eventSlug", { eventSlug })
      .orderBy('s.created_at', 'DESC')
      .getMany();

    for (const sub of waitSubs) {
      const cfg = sub.config ?? {};
      const runId = cfg.run_id as string | undefined;
      if (!runId) continue;
      const connectionId = cfg.connection_id as string | null | undefined;
      if (connectionId && sub.connectedAccountId && connectionId !== sub.connectedAccountId) {
        continue;
      }
      if (!matchesEventFilter(cfg.match as Record<string, unknown>, eventPayload)) {
        continue;
      }
      if (await this.isPausedTriggerRun(runId, orgId)) {
        runIds.push(runId);
      }
    }

    return [...new Set(runIds)];
  }

  private async isPausedTriggerRun(runId: string, orgId: string): Promise<boolean> {
    const run = await this.dataSource.getRepository(WorkflowRun).findOne({
      where: { id: runId, orgId },
    });
    return Boolean(run && run.status === 'paused' && run.waitMode === 'trigger_based');
  }
}

function asEventRecord(input: unknown): Record<string, unknown> | undefined {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return undefined;
}
