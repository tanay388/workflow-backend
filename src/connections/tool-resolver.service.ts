import { Injectable, Logger } from '@nestjs/common';
import type { Tool } from '@openai/agents';
import { AppConfigService } from '../common/config/config.service';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { ConnectionUnavailableError } from './connection.errors';
import { ConnectionHealthService } from './connection-health.service';
import { ConnectionsService } from './connections.service';
import { ComposioService } from './composio.service';
import type { Connection } from './entities/connection.entity';

export interface ToolkitBinding {
  connection_id?: string | null;
  actions?: string[];
}

@Injectable()
export class ToolResolverService {
  private readonly logger = new Logger(ToolResolverService.name);

  constructor(
    private readonly connections: ConnectionsService,
    private readonly composio: ComposioService,
    private readonly health: ConnectionHealthService,
    private readonly cfg: AppConfigService,
  ) {}

  async requireConnected(
    tenancy: Tenancy,
    connectionId: string,
  ): Promise<Connection> {
    const row = await this.connections.getById(tenancy, connectionId);
    await this.health.refreshIfStale(connectionId);
    const refreshed = await this.connections.getById(tenancy, connectionId);
    if (refreshed.status !== 'connected' || !refreshed.composioConnectionId) {
      throw new ConnectionUnavailableError(connectionId, refreshed.status);
    }
    return refreshed;
  }

  async resolveTools(
    tenancy: Tenancy,
    bindings: Record<string, ToolkitBinding>,
    legacyToolkits?: string[],
    legacyConnectionId?: string | null,
  ): Promise<Tool[]> {
    const merged = this.normalizeBindings(bindings, legacyToolkits, legacyConnectionId);
    const tools: Tool[] = [];

    for (const [toolkit, binding] of Object.entries(merged)) {
      let connectionId = binding.connection_id ?? null;
      if (!connectionId) {
        const fallback = await this.connections.resolveDefault(tenancy, toolkit);
        connectionId = fallback?.id ?? null;
      }
      if (!connectionId) continue;
      const row = await this.requireConnected(tenancy, connectionId);
      const maxTools = this.cfg.agentMaxToolsPerToolkit;
      let slugs = (binding.actions ?? []).filter(Boolean);
      if (!slugs.length) {
        const catalog = await this.composio.listToolkitTools(toolkit);
        const available = catalog.map((t) => t.slug);
        slugs = available.slice(0, maxTools);
        if (available.length > maxTools) {
          this.logger.warn(
            `Toolkit ${toolkit} has ${available.length} tools; capped to ${maxTools}. ` +
              'Select explicit actions in the agent node to control tool exposure.',
          );
        }
      } else if (slugs.length > maxTools) {
        this.logger.warn(
          `Toolkit ${toolkit} binding lists ${slugs.length} actions; capped to ${maxTools}`,
        );
        slugs = slugs.slice(0, maxTools);
      }
      const composioTools = await this.composio.getAgentTools(
        row.composioEntityId,
        slugs,
        row.composioConnectionId!,
      );
      if (composioTools.length === 0) {
        this.logger.warn(
          `No Composio tools resolved for toolkit=${toolkit} slugs=${slugs.join(',')}`,
        );
      } else {
        this.logger.log(
          `Resolved ${composioTools.length} Composio tool(s) for ${toolkit}: ${composioTools.map((t) => t.name).join(', ')}`,
        );
      }
      tools.push(...composioTools);
    }

    return tools;
  }

  async invoke(
    tenancy: Tenancy,
    connectionId: string,
    actionSlug: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
    try {
      const row = await this.requireConnected(tenancy, connectionId);
      const data = await this.composio.executeAction(
        row.composioEntityId,
        row.composioConnectionId!,
        actionSlug,
        args,
      );
      return { ok: true, data };
    } catch (e) {
      const message =
        e instanceof ConnectionUnavailableError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Action failed';
      return { ok: false, error: message };
    }
  }

  private normalizeBindings(
    bindings: Record<string, ToolkitBinding>,
    legacyToolkits?: string[],
    legacyConnectionId?: string | null,
  ): Record<string, ToolkitBinding> {
    const out = { ...bindings };
    for (const tk of legacyToolkits ?? []) {
      if (out[tk]) continue;
      out[tk] = legacyConnectionId
        ? { connection_id: legacyConnectionId, actions: [] }
        : { connection_id: null, actions: [] };
    }
    return out;
  }

}
