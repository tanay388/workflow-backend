import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { ComposioService } from '../connections/composio.service';
import { Connection } from '../connections/entities/connection.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import {
  TriggerSubscription,
  type TriggerSubscriptionStatus,
} from '../approvals/entities/trigger-subscription.entity';
import { disableInstanceIfUnshared } from '../approvals/external-trigger-cleanup.util';
import { CreateComposioTriggerDto } from './dto/trigger.dto';
import { TriggerIngestService } from './trigger-ingest.service';

@Injectable()
export class TriggerSubscriptionService {
  private readonly logger = new Logger(TriggerSubscriptionService.name);

  constructor(
    @InjectRepository(TriggerSubscription)
    private readonly subs: Repository<TriggerSubscription>,
    @InjectRepository(Connection)
    private readonly connections: Repository<Connection>,
    @InjectRepository(Workflow)
    private readonly workflows: Repository<Workflow>,
    private readonly composio: ComposioService,
    private readonly ingest: TriggerIngestService,
  ) {}

  async listForWorkflow(tenancy: Tenancy, workflowId: string) {
    await this.assertWorkflow(tenancy, workflowId);
    const rows = await this.subs.find({
      where: {
        orgId: tenancy.orgId,
        workspaceId: tenancy.workspaceId,
        workflowId,
        deletedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });
    return rows
      .filter((r) => r.isWorkflowTrigger())
      .map((r) => this.toDto(r));
  }

  async create(tenancy: Tenancy, workflowId: string, userId: string, dto: CreateComposioTriggerDto) {
    await this.assertWorkflow(tenancy, workflowId);

    const conn = await this.connections.findOne({
      where: {
        id: dto.connected_account_id,
        orgId: tenancy.orgId,
        workspaceId: tenancy.workspaceId,
        deletedAt: IsNull(),
      },
    });
    if (!conn?.composioConnectionId || conn.status !== 'connected') {
      throw new BadRequestException('Connection must be connected');
    }
    if (conn.toolkit.toLowerCase() !== dto.toolkit.toLowerCase()) {
      throw new BadRequestException('Connection toolkit does not match');
    }

    const row = this.subs.create({
      orgId: tenancy.orgId!,
      workspaceId: tenancy.workspaceId!,
      workflowId,
      kind: 'composio_event',
      connectedAccountId: conn.id,
      toolkit: dto.toolkit.toLowerCase(),
      eventSlug: dto.event_slug,
      config: dto.config ?? {},
      status: 'pending',
      userQuery: dto.user_query ?? null,
      createdBy: userId,
    });
    const saved = await this.subs.save(row);

    try {
      const external = await this.composio.upsertTriggerInstance(
        dto.event_slug,
        conn.composioConnectionId,
        dto.config ?? {},
      );
      saved.externalId = external.id;
      saved.status = this.mapComposioStatus(external.status);
      await this.subs.save(saved);
    } catch (e) {
      saved.status = 'error';
      await this.subs.save(saved);
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Failed to register Composio trigger',
      );
    }

    return this.toDto(saved);
  }

  async remove(tenancy: Tenancy, id: string, userId: string): Promise<{ ok: boolean }> {
    const row = await this.subs.findOne({
      where: { id, orgId: tenancy.orgId, workspaceId: tenancy.workspaceId, deletedAt: IsNull() },
    });
    if (!row || !row.isWorkflowTrigger()) {
      throw new NotFoundException('Trigger not found');
    }

    if (row.externalId) {
      await disableInstanceIfUnshared(this.subs, this.composio, row.externalId, row.id);
    }
    row.status = 'disabled';
    row.deletedAt = new Date();
    row.deletedBy = userId;
    await this.subs.save(row);
    return { ok: true };
  }

  async test(tenancy: Tenancy, id: string): Promise<{ runId: string | null }> {
    const row = await this.subs.findOne({
      where: { id, orgId: tenancy.orgId, workspaceId: tenancy.workspaceId, deletedAt: IsNull() },
    });
    if (!row || !row.isWorkflowTrigger()) {
      throw new NotFoundException('Trigger not found');
    }

    const result = await this.ingest.ingest({
      orgId: row.orgId,
      workspaceId: row.workspaceId,
      workflowId: row.workflowId,
      source: 'composio_test',
      idempotencyKey: `test:${row.id}:${Date.now()}`,
      triggerSource: 'external_event',
      input: { test: true, trigger_id: row.id },
      runBy: { type: 'trigger', id: row.id, label: `Test ${row.eventSlug}` },
      triggerMetadata: { subscription_id: row.id, test: true },
    });
    return { runId: result.runId };
  }

  async resolveByExternalId(externalId: string): Promise<TriggerSubscription | null> {
    return this.subs.findOne({
      where: { externalId, deletedAt: IsNull(), status: 'active' },
    });
  }

  private mapComposioStatus(raw?: string): TriggerSubscriptionStatus {
    const s = String(raw ?? '').toLowerCase();
    if (s.includes('active') || s.includes('enabled')) return 'active';
    if (s.includes('error') || s.includes('fail')) return 'error';
    if (s.includes('disable')) return 'disabled';
    return 'pending';
  }

  private async assertWorkflow(tenancy: Tenancy, workflowId: string): Promise<Workflow> {
    const wf = await this.workflows.findOne({
      where: { id: workflowId, orgId: tenancy.orgId, workspaceId: tenancy.workspaceId },
    });
    if (!wf) throw new NotFoundException('Workflow not found');
    return wf;
  }

  private toDto(row: TriggerSubscription) {
    return {
      id: row.id,
      workflow_id: row.workflowId,
      connected_account_id: row.connectedAccountId,
      toolkit: row.toolkit,
      event_slug: row.eventSlug,
      config: row.config,
      external_id: row.externalId,
      status: row.status ?? 'pending',
      user_query: row.userQuery,
      created_at: row.createdAt.toISOString(),
    };
  }
}
