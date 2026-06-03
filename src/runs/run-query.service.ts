import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { normalizePagination, paginate } from '../common/utils/pagination';
import { Workflow } from '../workflows/entities/workflow.entity';
import { RunStep } from './entities/run-step.entity';
import { WorkflowRun } from './entities/workflow-run.entity';

export interface ListRunsFilters {
  page?: number;
  limit?: number;
  workflowId?: string;
  status?: string;
  triggerSource?: string;
  from?: string;
  to?: string;
  runByType?: string;
  runById?: string;
}

@Injectable()
export class RunQueryService {
  constructor(
    @InjectRepository(WorkflowRun) private readonly runs: Repository<WorkflowRun>,
    @InjectRepository(RunStep) private readonly steps: Repository<RunStep>,
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async list(tenancy: Tenancy, query: ListRunsFilters) {
    const { page, limit, offset } = normalizePagination(query);
    const qb = this.runs
      .createQueryBuilder('r')
      .where('r.org_id = :orgId', { orgId: tenancy.orgId })
      .andWhere('r.workspace_id = :workspaceId', { workspaceId: tenancy.workspaceId });

    if (query.workflowId) {
      qb.andWhere('r.workflow_id = :workflowId', { workflowId: query.workflowId });
    }
    if (query.status) qb.andWhere('r.status = :status', { status: query.status });
    if (query.triggerSource) {
      qb.andWhere('r.trigger_source = :triggerSource', { triggerSource: query.triggerSource });
    }
    if (query.from) {
      qb.andWhere('r.created_at >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('r.created_at <= :to', { to: new Date(query.to) });
    }
    if (query.runByType) {
      qb.andWhere("r.run_by->>'type' = :runByType", { runByType: query.runByType });
    }
    if (query.runById) {
      qb.andWhere("r.run_by->>'id' = :runById", { runById: query.runById });
    }

    qb.orderBy('r.created_at', 'DESC').skip(offset).take(limit);
    const [rows, total] = await qb.getManyAndCount();

    const enriched = await this.enrichSummaries(rows);

    const summaries = await Promise.all(
      rows.map(async (row, i) => ({
        ...enriched[i],
        queueAhead: row.status === 'queued' ? await this.queueAhead(row) : null,
      })),
    );

    return paginate(summaries, total, page, limit);
  }

  async detail(tenancy: Tenancy, runId: string) {
    const run = await this.runs.findOne({
      where: { id: runId, orgId: tenancy.orgId, workspaceId: tenancy.workspaceId },
    });
    if (!run) throw new NotFoundException('Run not found');

    const steps = await this.steps.find({
      where: { runId },
      order: { seq: 'ASC' },
    });

    const [summary] = await this.enrichSummaries([run]);

    return {
      ...summary,
      steps: steps.map((s) => this.toStepDetail(s)),
      queueAhead: run.status === 'queued' ? await this.queueAhead(run) : null,
    };
  }

  async getRunForStream(tenancy: Tenancy, runId: string): Promise<WorkflowRun> {
    const run = await this.runs.findOne({
      where: { id: runId, orgId: tenancy.orgId, workspaceId: tenancy.workspaceId },
    });
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  async getStepsForReplay(runId: string): Promise<RunStep[]> {
    return this.steps.find({ where: { runId }, order: { seq: 'ASC' } });
  }

  private async queueAhead(run: WorkflowRun): Promise<number> {
    const row = await this.runs
      .createQueryBuilder('r')
      .select('count(*)::int', 'c')
      .where('r.org_id = :orgId', { orgId: run.orgId })
      .andWhere("r.status = 'queued'")
      .andWhere('r.created_at < :createdAt', { createdAt: run.createdAt })
      .getRawOne<{ c: number }>();
    return row?.c ?? 0;
  }

  private async enrichSummaries(runs: WorkflowRun[]) {
    if (runs.length === 0) return [];

    const workflowIds = [...new Set(runs.map((r) => r.workflowId))];
    const userIds = new Set<string>();
    for (const run of runs) {
      const runBy = run.runBy as { type?: string; id?: string } | null;
      if (runBy?.type === 'user' && runBy.id) userIds.add(runBy.id);
    }

    const [workflowRows, userRows] = await Promise.all([
      this.workflows.findBy({ id: In(workflowIds) }),
      userIds.size ? this.users.findBy({ id: In([...userIds]) }) : [],
    ]);

    const workflowMap = new Map(workflowRows.map((w) => [w.id, w.name]));
    const userMap = new Map(userRows.map((u) => [u.id, u.name || u.email]));

    return runs.map((run) => {
      const summary = this.toSummary(run);
      const runBy = run.runBy as { type?: string; id?: string; label?: string } | null;
      let runByDisplay: string | null = null;
      if (runBy?.type === 'user' && runBy.id) {
        runByDisplay = userMap.get(runBy.id) ?? runBy.label ?? runBy.id;
      } else if (runBy?.label) {
        runByDisplay = runBy.label;
      } else if (runBy?.id) {
        runByDisplay = runBy.id;
      }

      return {
        ...summary,
        workflowName: workflowMap.get(run.workflowId) ?? null,
        runByDisplay,
      };
    });
  }

  private toSummary(run: WorkflowRun) {
    const durationMs =
      run.startedAt && run.finishedAt
        ? run.finishedAt.getTime() - run.startedAt.getTime()
        : run.startedAt
          ? Date.now() - run.startedAt.getTime()
          : null;

    return {
      id: run.id,
      workflowId: run.workflowId,
      workflowVersionId: run.workflowVersionId,
      status: run.status,
      triggerSource: run.triggerSource,
      runBy: run.runBy,
      input: run.input,
      output: run.output,
      error: run.error,
      attempts: run.attempts,
      maxAttempts: run.maxAttempts,
      totalInputTokens: Number(run.totalInputTokens),
      totalOutputTokens: Number(run.totalOutputTokens),
      totalCostUsd: Number(run.totalCostUsd),
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      createdAt: run.createdAt,
      durationMs,
      resumeAt: run.resumeAt,
      waitMode: run.waitMode,
      lastCompletedNodeId: run.lastCompletedNodeId,
    };
  }

  private toStepDetail(step: RunStep) {
    const durationMs =
      step.endedAt && step.startedAt
        ? step.endedAt.getTime() - step.startedAt.getTime()
        : step.startedAt
          ? Date.now() - step.startedAt.getTime()
          : null;

    return {
      id: step.id,
      nodeId: step.nodeId,
      nodeType: step.nodeType,
      nodeLabel: step.nodeLabel,
      status: step.status,
      input: step.input,
      output: step.output,
      error: step.error,
      inputTokens: step.inputTokens,
      outputTokens: step.outputTokens,
      model: step.model,
      costUsd: Number(step.costUsd),
      seq: step.seq,
      startedAt: step.startedAt,
      endedAt: step.endedAt,
      durationMs,
    };
  }
}
