import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { AppConfigService } from '../common/config/config.service';
import { Workflow } from '../workflows/entities/workflow.entity';
import { WorkflowVersion } from '../workflows/entities/workflow-version.entity';
import { ConnectionInUseError } from './connection.errors';
import { composioEntityId } from './composio-entity.util';
import { ComposioService } from './composio.service';
import { Connection, type ConnectionStatus } from './entities/connection.entity';
import { IntegrationCatalog } from './entities/integration-catalog.entity';

export interface ConnectionUsageRef {
  workflowId: string;
  workflowName: string;
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
}

export interface TriggerToolkitCatalogItem {
  slug: string;
  label: string;
  logo_url: string;
  supports_triggers: boolean;
  category: string;
  status: 'ga' | 'beta';
}

/** Matches Composio per-toolkit trigger cache TTL (10h). */
const TRIGGER_TOOLKITS_CACHE_TTL_MS = 10 * 60 * 60 * 1000;
const TRIGGER_TOOLKIT_COMPOSIO_CONCURRENCY = 6;

@Injectable()
export class ConnectionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectionsService.name);
  private triggerToolkitsCache: { ts: number; data: TriggerToolkitCatalogItem[] } | null =
    null;
  private triggerToolkitsLoad: Promise<TriggerToolkitCatalogItem[]> | null = null;
  private triggerToolkitsRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Connection)
    private readonly connections: Repository<Connection>,
    @InjectRepository(IntegrationCatalog)
    private readonly catalog: Repository<IntegrationCatalog>,
    @InjectRepository(Workflow)
    private readonly workflows: Repository<Workflow>,
    @InjectRepository(WorkflowVersion)
    private readonly versions: Repository<WorkflowVersion>,
    private readonly composio: ComposioService,
    private readonly appConfig: AppConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.composio.isConfigured()) return;
    void this.warmTriggerToolkitsCache();
    this.triggerToolkitsRefreshTimer = setInterval(() => {
      void this.refreshTriggerToolkitsCache().catch((e) =>
        this.logger.warn(`Trigger toolkit cache refresh failed: ${e}`),
      );
    }, TRIGGER_TOOLKITS_CACHE_TTL_MS);
  }

  onModuleDestroy(): void {
    if (this.triggerToolkitsRefreshTimer) {
      clearInterval(this.triggerToolkitsRefreshTimer);
      this.triggerToolkitsRefreshTimer = null;
    }
  }

  async listCatalog() {
    const rows = await this.catalog.find({ order: { label: 'ASC' } });
    const items = rows.map((r) => ({
      slug: r.slug,
      label: r.label,
      logo_url: r.logoUrl,
      supports_triggers: r.supportsTriggers,
      category: r.category,
      status: r.status,
    }));
    items.sort((a, b) => {
      const rank = (s: string) => (s === 'beta' ? 1 : 0);
      const byStatus = rank(a.status) - rank(b.status);
      if (byStatus !== 0) return byStatus;
      return a.label.localeCompare(b.label);
    });
    return items;
  }

  async listToolkitTools(toolkit: string) {
    return this.composio.listToolkitTools(toolkit);
  }

  async listToolkitTriggers(toolkit: string) {
    return this.composio.listToolkitTriggers(toolkit);
  }

  async listTriggerToolkits(): Promise<TriggerToolkitCatalogItem[]> {
    const cached = this.triggerToolkitsCache;
    const now = Date.now();
    if (cached) {
      if (now - cached.ts < TRIGGER_TOOLKITS_CACHE_TTL_MS) {
        return cached.data;
      }
      // Stale but usable — refresh in background; avoid another 8s wait on the client.
      void this.loadTriggerToolkits();
      return cached.data;
    }
    return this.loadTriggerToolkits();
  }

  /** Preload trigger-toolkit list on boot (non-blocking). */
  warmTriggerToolkitsCache(): Promise<TriggerToolkitCatalogItem[]> {
    const cached = this.triggerToolkitsCache;
    if (cached && Date.now() - cached.ts < TRIGGER_TOOLKITS_CACHE_TTL_MS) {
      return Promise.resolve(cached.data);
    }
    return this.loadTriggerToolkits();
  }

  /** Force rebuild of trigger-toolkit cache (used on 10h interval). */
  private async refreshTriggerToolkitsCache(): Promise<TriggerToolkitCatalogItem[]> {
    this.triggerToolkitsCache = null;
    return this.loadTriggerToolkits();
  }

  private loadTriggerToolkits(): Promise<TriggerToolkitCatalogItem[]> {
    if (!this.triggerToolkitsLoad) {
      this.triggerToolkitsLoad = this.fetchTriggerToolkits()
        .then((data) => {
          this.triggerToolkitsCache = { ts: Date.now(), data };
          return data;
        })
        .finally(() => {
          this.triggerToolkitsLoad = null;
        });
    }
    return this.triggerToolkitsLoad;
  }

  private async fetchTriggerToolkits(): Promise<TriggerToolkitCatalogItem[]> {
    const start = Date.now();
    if (!this.composio.isConfigured()) {
      return [];
    }

    const candidates = await this.catalog.find({
      where: { supportsTriggers: true },
      order: { label: 'ASC' },
    });

    const data: TriggerToolkitCatalogItem[] = [];
    for (let i = 0; i < candidates.length; i += TRIGGER_TOOLKIT_COMPOSIO_CONCURRENCY) {
      const batch = candidates.slice(i, i + TRIGGER_TOOLKIT_COMPOSIO_CONCURRENCY);
      const settled = await Promise.all(
        batch.map(async (row) => {
          try {
            const hasTriggers = await this.composio.toolkitHasTriggers(row.slug);
            if (!hasTriggers) return null;
            return {
              slug: row.slug,
              label: row.label,
              logo_url: row.logoUrl,
              supports_triggers: row.supportsTriggers,
              category: row.category,
              status: row.status as TriggerToolkitCatalogItem['status'],
            };
          } catch (e) {
            this.logger.warn(
              `Composio trigger check failed for ${row.slug}: ${e instanceof Error ? e.message : e}`,
            );
            return null;
          }
        }),
      );
      for (const item of settled) {
        if (item) data.push(item);
      }
    }

    data.sort((a, b) => {
      const rank = (s: string) => (s === 'beta' ? 1 : 0);
      const byStatus = rank(a.status) - rank(b.status);
      if (byStatus !== 0) return byStatus;
      return a.label.localeCompare(b.label);
    });

    this.logger.log(
      `Trigger toolkit catalog cached (${data.length}/${candidates.length} from DB, ${Date.now() - start}ms)`,
    );
    return data;
  }

  async listForToolkit(tenancy: Tenancy, toolkit?: string) {
    const where: Record<string, unknown> = {
      orgId: tenancy.orgId,
      workspaceId: tenancy.workspaceId,
      deletedAt: IsNull(),
    };
    if (toolkit) where.toolkit = toolkit;
    const rows = await this.connections.find({
      where,
      order: { isDefault: 'DESC', name: 'ASC' },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async getById(tenancy: Tenancy, id: string): Promise<Connection> {
    const row = await this.connections.findOne({
      where: {
        id,
        orgId: tenancy.orgId,
        workspaceId: tenancy.workspaceId,
        deletedAt: IsNull(),
      },
    });
    if (!row) throw new NotFoundException('Connection not found');
    return row;
  }

  async resolveDefault(tenancy: Tenancy, toolkit: string): Promise<Connection | null> {
    return this.connections.findOne({
      where: {
        orgId: tenancy.orgId,
        workspaceId: tenancy.workspaceId,
        toolkit,
        isDefault: true,
        status: 'connected',
        deletedAt: IsNull(),
      },
    });
  }

  async createPending(
    tenancy: Tenancy,
    toolkit: string,
    name: string,
  ): Promise<{ connection: Connection; redirectUrl: string | null }> {
    const entityId = composioEntityId(tenancy.workspaceId!);
    const row = this.connections.create({
      orgId: tenancy.orgId!,
      workspaceId: tenancy.workspaceId!,
      toolkit: toolkit.trim().toLowerCase(),
      name: name.trim(),
      composioEntityId: entityId,
      status: 'pending',
      isDefault: false,
    });
    const existingDefault = await this.connections.count({
      where: {
        workspaceId: tenancy.workspaceId,
        toolkit: row.toolkit,
        isDefault: true,
        deletedAt: IsNull(),
      },
    });
    if (existingDefault === 0) row.isDefault = true;

    await this.connections.save(row);

    let redirectUrl: string | null = null;
    if (this.composio.isConfigured()) {
      const callback = `${this.appConfig.frontendUrl}/connections/callback?connection_id=${row.id}`;
      const initiated = await this.composio.initiateConnection(
        tenancy.workspaceId!,
        row.toolkit,
        callback,
      );
      redirectUrl = initiated.redirectUrl;
    }

    return { connection: row, redirectUrl };
  }

  async finalize(connectionId: string, composioConnectionId: string): Promise<Connection> {
    const row = await this.connections.findOne({
      where: { id: connectionId, deletedAt: IsNull() },
    });
    if (!row) throw new NotFoundException('Connection not found');

    row.composioConnectionId = composioConnectionId;
    row.status = 'connected';
    row.lastCheckedAt = new Date();
    return this.connections.save(row);
  }

  async reconnect(tenancy: Tenancy, id: string): Promise<{ redirectUrl: string | null }> {
    const row = await this.getById(tenancy, id);
    row.status = 'pending';
    await this.connections.save(row);

    if (!this.composio.isConfigured()) {
      return { redirectUrl: null };
    }
    const callback = `${this.appConfig.frontendUrl}/connections/callback?connection_id=${row.id}`;
    const initiated = await this.composio.initiateConnection(
      tenancy.workspaceId!,
      row.toolkit,
      callback,
    );
    return { redirectUrl: initiated.redirectUrl };
  }

  async patch(
    tenancy: Tenancy,
    id: string,
    patch: { name?: string; is_default?: boolean },
  ): Promise<Connection> {
    const row = await this.getById(tenancy, id);
    if (patch.name) row.name = patch.name.trim();
    if (patch.is_default === true) {
      await this.connections.update(
        {
          workspaceId: tenancy.workspaceId,
          toolkit: row.toolkit,
          deletedAt: IsNull(),
        },
        { isDefault: false },
      );
      row.isDefault = true;
    }
    return this.connections.save(row);
  }

  async updateStatus(id: string, status: ConnectionStatus): Promise<void> {
    await this.connections.update(id, { status, lastCheckedAt: new Date() });
  }

  async whereUsed(tenancy: Tenancy, connectionId: string): Promise<ConnectionUsageRef[]> {
    const refs: ConnectionUsageRef[] = [];
    const workflowRows = await this.workflows.find({
      where: {
        orgId: tenancy.orgId,
        workspaceId: tenancy.workspaceId,
        deletedAt: IsNull(),
      },
      relations: { currentVersion: true },
    });
    const seen = new Set<string>();

    for (const wf of workflowRows) {
      const ver = wf.currentVersion;
      if (!ver?.graph?.nodes) continue;
      for (const node of ver.graph.nodes) {
        const config = node.config ?? {};
        const bindings = config.toolkit_bindings as Record<string, { connection_id?: string }> | undefined;
        let hit = config.connection_id === connectionId || config.connected_account_id === connectionId;
        if (bindings) {
          for (const b of Object.values(bindings)) {
            if (b?.connection_id === connectionId) hit = true;
          }
        }
        if (!hit) continue;
        const key = `${wf.id}:${node.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push({
          workflowId: wf.id,
          workflowName: wf.name,
          nodeId: String(node.id),
          nodeLabel: String(node.label ?? node.id),
          nodeType: String(node.type ?? ''),
        });
      }
    }
    return refs;
  }

  async remove(tenancy: Tenancy, id: string, force = false): Promise<void> {
    const usage = await this.whereUsed(tenancy, id);
    if (usage.length && !force) {
      throw new ConnectionInUseError(usage);
    }
    const row = await this.getById(tenancy, id);
    await this.connections.softRemove(row);
  }

  private toSummary(row: Connection) {
    return {
      id: row.id,
      toolkit: row.toolkit,
      name: row.name,
      is_default: row.isDefault,
      status: row.status,
      composio_connection_id: row.composioConnectionId,
      last_checked_at: row.lastCheckedAt,
      created_at: row.createdAt,
    };
  }
}
