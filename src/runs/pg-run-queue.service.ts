import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppConfigService } from '../common/config/config.service';
import { queryResultAffected, queryResultRows } from '../common/database/query-result';
import {
  RUN_QUEUE,
  type EnqueueRunInput,
  type RunQueue,
  type RunTerminalStatus,
} from '../common/queue/run-queue.interface';
import { OrgStatus } from '../iam/entities/organization.entity';
import { MeterGuard } from '../metering/meter-guard.service';
import type { MeterRejectReason } from '../metering/metering.types';
import { WorkflowRun } from './entities/workflow-run.entity';

export { RUN_QUEUE };

@Injectable()
export class PgRunQueue implements RunQueue {
  private readonly workerId: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly meterGuard: MeterGuard,
    cfg: AppConfigService,
  ) {
    this.workerId = `worker-${process.pid}-${Date.now()}`;
  }

  getWorkerId(): string {
    return this.workerId;
  }

  async enqueue(input: EnqueueRunInput): Promise<{ runId: string }> {
    const org = await this.dataSource.query(
      `SELECT status FROM organizations WHERE id = $1`,
      [input.orgId],
    );
    const status = queryResultRows<{ status: string }>(org)[0]?.status;
    if (status === OrgStatus.SUSPENDED) {
      throw new BadRequestException('org_suspended');
    }

    const guard = await this.meterGuard.checkClaimAllowed(input.orgId);
    if (!guard.allowed && guard.reason) {
      throw new BadRequestException(guard.reason);
    }

    const repo = this.dataSource.getRepository(WorkflowRun);
    const row = repo.create({
      orgId: input.orgId,
      workspaceId: input.workspaceId,
      workflowId: input.workflowId,
      workflowVersionId: input.workflowVersionId,
      triggerSource: input.triggerSource as WorkflowRun['triggerSource'],
      runBy: (input.runBy as Record<string, unknown>) ?? null,
      triggerMetadata: input.triggerMetadata ?? null,
      input: input.input ?? {},
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      status: 'queued',
    });
    const saved = await repo.save(row);

    await this.dataSource.query(`SELECT pg_notify('run_enqueued', $1)`, [saved.id]);
    return { runId: saved.id };
  }

  /** TRD §6.3 fairness CTE — claim + mark running atomically. */
  async claimRunnable(limit: number): Promise<string[]> {
    await this.failBlockedQueuedRuns();

    const blockedOrgIds = await this.blockedOrgIds();
    const excludeClause =
      blockedOrgIds.length > 0
        ? `AND ranked.org_id NOT IN (${blockedOrgIds.map((_, i) => `$${i + 3}`).join(', ')})`
        : '';

    const result = await this.dataSource.query(
      `
      WITH running AS (
        SELECT org_id, count(*)::int AS c
        FROM workflow_runs
        WHERE status = 'running'
        GROUP BY org_id
      ),
      ranked AS (
        SELECT r.id, r.org_id,
               row_number() OVER (PARTITION BY r.org_id ORDER BY r.created_at) AS rn
        FROM workflow_runs r
        WHERE r.status = 'queued'
      ),
      picked AS (
        SELECT ranked.id
        FROM ranked
        JOIN organizations o ON o.id = ranked.org_id
        LEFT JOIN running ON running.org_id = ranked.org_id
        WHERE ranked.rn <= (o.concurrency_limit - COALESCE(running.c, 0))
          AND o.status = 'active'
          ${excludeClause}
        ORDER BY ranked.org_id, ranked.rn
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE workflow_runs wr
      SET status = 'running',
          locked_by = $2,
          locked_at = now(),
          started_at = COALESCE(wr.started_at, now())
      FROM picked
      WHERE wr.id = picked.id
      RETURNING wr.id
      `,
      [limit, this.workerId, ...blockedOrgIds],
    );
    return queryResultRows<{ id: string }>(result).map((r) => r.id);
  }

  async failBlockedQueuedRuns(): Promise<number> {
    const orgRows = await this.dataSource.query(
      `
      SELECT DISTINCT org_id FROM workflow_runs WHERE status = 'queued'
      `,
    );
    const orgIds = queryResultRows<{ org_id: string }>(orgRows).map((r) => r.org_id);
    let failed = 0;

    for (const orgId of orgIds) {
      const guard = await this.meterGuard.checkClaimAllowed(orgId);
      if (guard.allowed || !guard.reason) continue;

      const result = await this.dataSource.query(
        `
        UPDATE workflow_runs
        SET status = 'failed',
            error = $1,
            finished_at = now(),
            locked_by = NULL,
            locked_at = NULL
        WHERE status = 'queued' AND org_id = $2
        `,
        [guard.reason, orgId],
      );
      failed += queryResultAffected(result);
    }
    return failed;
  }

  private async blockedOrgIds(): Promise<string[]> {
    const orgRows = await this.dataSource.query(
      `SELECT DISTINCT org_id FROM workflow_runs WHERE status = 'queued'`,
    );
    const orgIds = queryResultRows<{ org_id: string }>(orgRows).map((r) => r.org_id);
    const blocked: string[] = [];
    for (const orgId of orgIds) {
      const guard = await this.meterGuard.checkClaimAllowed(orgId);
      if (!guard.allowed) blocked.push(orgId);
    }
    return blocked;
  }

  async markRunning(_runId: string): Promise<void> {
    // Claim path already marks running.
  }

  async markPaused(runId: string, resumeAt?: Date): Promise<void> {
    await this.dataSource.getRepository(WorkflowRun).update(runId, {
      status: 'paused',
      resumeAt: resumeAt ?? null,
      lockedBy: null,
      lockedAt: null,
    });
  }

  async markDone(runId: string, status: RunTerminalStatus, error?: string): Promise<void> {
    await this.dataSource.getRepository(WorkflowRun).update(runId, {
      status,
      error: error ?? null,
      finishedAt: new Date(),
      lockedBy: null,
      lockedAt: null,
      resumeAt: null,
    });
  }

  async requeuePausedDue(now = new Date()): Promise<number> {
    const result = await this.dataSource.query(
      `
      UPDATE workflow_runs
      SET status = 'queued', resume_at = NULL, locked_by = NULL, locked_at = NULL
      WHERE status = 'paused'
        AND resume_at IS NOT NULL
        AND resume_at <= $1
      `,
      [now],
    );
    return queryResultAffected(result);
  }

  async reclaimStalled(staleBefore: Date): Promise<number> {
    const result = await this.dataSource.query(
      `
      UPDATE workflow_runs
      SET status = 'queued', locked_by = NULL, locked_at = NULL
      WHERE status = 'running'
        AND locked_at IS NOT NULL
        AND locked_at < $1
      `,
      [staleBefore],
    );
    return queryResultAffected(result);
  }
}

export type { MeterRejectReason };
