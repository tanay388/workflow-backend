import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AppConfigService } from '../common/config/config.service';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { Workflow } from '../workflows/entities/workflow.entity';
import { WorkflowRun } from '../runs/entities/workflow-run.entity';
import { WorkflowTriggerLink } from './entities/workflow-trigger.entity';
import { CreateWorkflowTriggerLinkDto } from './dto/trigger.dto';
import { TriggerIngestService } from './trigger-ingest.service';

@Injectable()
export class WorkflowTriggerService {
  private readonly logger = new Logger(WorkflowTriggerService.name);

  constructor(
    @InjectRepository(WorkflowTriggerLink)
    private readonly links: Repository<WorkflowTriggerLink>,
    @InjectRepository(Workflow)
    private readonly workflows: Repository<Workflow>,
    @InjectRepository(WorkflowRun)
    private readonly runs: Repository<WorkflowRun>,
    private readonly ingest: TriggerIngestService,
    private readonly config: AppConfigService,
  ) {}

  async listForSource(tenancy: Tenancy, sourceWorkflowId: string) {
    await this.assertWorkflow(tenancy, sourceWorkflowId);
    const rows = await this.links.find({
      where: { orgId: tenancy.orgId, sourceWorkflowId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(tenancy: Tenancy, userId: string, dto: CreateWorkflowTriggerLinkDto) {
    if (dto.source_workflow_id === dto.target_workflow_id) {
      throw new BadRequestException('Source and target workflows must differ');
    }
    await this.assertWorkflow(tenancy, dto.source_workflow_id);
    await this.assertWorkflow(tenancy, dto.target_workflow_id);

    const row = this.links.create({
      orgId: tenancy.orgId!,
      sourceWorkflowId: dto.source_workflow_id,
      targetWorkflowId: dto.target_workflow_id,
      event: dto.event,
      isActive: true,
      createdBy: userId,
    });
    const saved = await this.links.save(row);
    return this.toDto(saved);
  }

  async remove(tenancy: Tenancy, id: string, userId: string): Promise<{ ok: boolean }> {
    const row = await this.links.findOne({
      where: { id, orgId: tenancy.orgId, deletedAt: IsNull() },
    });
    if (!row) throw new NotFoundException('Workflow trigger not found');
    row.isActive = false;
    row.deletedAt = new Date();
    row.deletedBy = userId;
    await this.links.save(row);
    return { ok: true };
  }

  /** Called when a run reaches a terminal status — enqueue chained workflows. */
  async onRunFinished(runId: string): Promise<void> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run || !['completed', 'failed'].includes(run.status)) return;

    const event = run.status === 'completed' ? 'completed' : 'failed';
    const activeLinks = await this.links.find({
      where: {
        orgId: run.orgId,
        sourceWorkflowId: run.workflowId,
        event,
        isActive: true,
        deletedAt: IsNull(),
      },
    });

    for (const link of activeLinks) {
      try {
        await this.enqueueChainTarget(run, link);
      } catch (e) {
        this.logger.warn(
          `Workflow chain ${run.workflowId} → ${link.targetWorkflowId} skipped: ${e}`,
        );
      }
    }
  }

  private async enqueueChainTarget(
    sourceRun: WorkflowRun,
    link: WorkflowTriggerLink,
  ): Promise<void> {
    const metadata = this.buildChainMetadata(sourceRun, link.targetWorkflowId);
    if (!metadata) return;

    const input =
      sourceRun.status === 'completed'
        ? { ...(typeof sourceRun.output === 'object' && sourceRun.output ? sourceRun.output : { output: sourceRun.output }) }
        : { error: sourceRun.error, failed_run_id: sourceRun.id };

    await this.ingest.ingest({
      orgId: sourceRun.orgId,
      workspaceId: sourceRun.workspaceId,
      workflowId: link.targetWorkflowId,
      source: 'workflow_chain',
      idempotencyKey: `chain:${sourceRun.id}:${link.id}`,
      triggerSource: 'workflow_completed',
      input,
      runBy: {
        type: 'trigger',
        id: link.id,
        label: `When ${link.sourceWorkflowId} ${link.event}`,
      },
      triggerMetadata: metadata,
    });
  }

  private buildChainMetadata(
    sourceRun: WorkflowRun,
    targetWorkflowId: string,
  ): Record<string, unknown> | null {
    const prev = sourceRun.triggerMetadata ?? {};
    const depth = ((prev.chain_depth as number) ?? 0) + 1;
    const visited = [
      ...((prev.visited_workflow_ids as string[]) ?? []),
      sourceRun.workflowId,
    ];

    const maxDepth = this.config.triggers.chainMaxDepth;
    if (depth > maxDepth) {
      this.logger.warn(`Chain depth ${depth} exceeds max ${maxDepth}`);
      return null;
    }
    if (visited.includes(targetWorkflowId)) {
      this.logger.warn(`Cycle detected: ${targetWorkflowId} already in chain`);
      return null;
    }

    return {
      chain_depth: depth,
      visited_workflow_ids: visited,
      parent_run_id: sourceRun.id,
      source_workflow_id: sourceRun.workflowId,
    };
  }

  private async assertWorkflow(tenancy: Tenancy, workflowId: string): Promise<void> {
    const wf = await this.workflows.findOne({
      where: { id: workflowId, orgId: tenancy.orgId, workspaceId: tenancy.workspaceId },
    });
    if (!wf) throw new NotFoundException('Workflow not found');
  }

  private toDto(row: WorkflowTriggerLink) {
    return {
      id: row.id,
      source_workflow_id: row.sourceWorkflowId,
      target_workflow_id: row.targetWorkflowId,
      event: row.event,
      is_active: row.isActive,
      created_at: row.createdAt.toISOString(),
    };
  }
}
