import { Injectable, Logger } from '@nestjs/common';
import { Composio } from '@composio/core';
import { OpenAIAgentsProvider } from '@composio/openai-agents';
import type { Tool } from '@openai/agents';
import { AppConfigService } from '../common/config/config.service';
import { composioEntityId } from './composio-entity.util';

export interface ComposioToolSummary {
  slug: string;
  name: string;
  description: string;
  toolkit: { slug: string; name: string; logo: string };
}

export interface ComposioTriggerSummary {
  slug: string;
  name: string;
  description: string;
  type: 'webhook' | 'poll';
  toolkit: { slug: string; name: string; logo: string };
  config: Record<string, unknown>;
  payload: Record<string, unknown>;
}

type ComposioAgentsClient = Composio<OpenAIAgentsProvider>;

@Injectable()
export class ComposioService {
  private readonly logger = new Logger(ComposioService.name);
  private client: ComposioAgentsClient | null = null;
  private readonly toolsCache = new Map<string, { ts: number; data: ComposioToolSummary[] }>();
  private readonly triggersCache = new Map<string, { ts: number; data: ComposioTriggerSummary[] }>();
  private readonly CACHE_TTL_MS = 10 * 60 * 60 * 1000;

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.composio.apiKey);
  }

  private getClient(): ComposioAgentsClient {
    if (!this.isConfigured()) {
      throw new Error('COMPOSIO_API_KEY is not configured');
    }
    if (!this.client) {
      this.client = new Composio<OpenAIAgentsProvider>({
        apiKey: this.config.composio.apiKey!,
        provider: new OpenAIAgentsProvider(),
      });
    }
    return this.client;
  }

  getOrCreateEntity(workspaceId: string): string {
    return composioEntityId(workspaceId);
  }

  async initiateConnection(
    workspaceId: string,
    toolkit: string,
    callbackUrl: string,
  ): Promise<{ redirectUrl: string }> {
    const entityId = this.getOrCreateEntity(workspaceId);
    const composio = this.getClient();
    const session = await composio.create(entityId, { manageConnections: false });
    const connectionRequest = await session.authorize(toolkit, { callbackUrl });
    const redirectUrl = connectionRequest.redirectUrl ?? '';
    if (!redirectUrl) {
      throw new Error('Composio did not return a redirect URL');
    }
    return { redirectUrl };
  }

  async getConnectionStatus(composioConnectionId: string): Promise<'connected' | 'expired' | 'error' | 'pending'> {
    if (!this.isConfigured()) return 'pending';
    try {
      const composio = this.getClient();
      const account = await composio.connectedAccounts.get(composioConnectionId);
      const raw = String(account?.status ?? '').toUpperCase();
      if (raw === 'ACTIVE' || raw === 'CONNECTED') return 'connected';
      if (raw === 'EXPIRED') return 'expired';
      if (raw === 'FAILED' || raw === 'ERROR') return 'error';
      return 'pending';
    } catch (e) {
      this.logger.warn(`Composio status check failed for ${composioConnectionId}: ${e}`);
      return 'error';
    }
  }

  async listToolkitTools(toolkitSlug: string): Promise<ComposioToolSummary[]> {
    const key = toolkitSlug.trim().toLowerCase();
    const now = Date.now();
    const cached = this.toolsCache.get(key);
    if (cached && now - cached.ts < this.CACHE_TTL_MS) {
      return cached.data;
    }

    if (!this.isConfigured()) {
      return [];
    }

    const url = `https://backend.composio.dev/api/v3/tools?toolkit_versions=latest&toolkit_slug=${encodeURIComponent(
      key,
    )}&limit=500`;
    const resp = await fetch(url, {
      headers: { 'x-api-key': this.config.composio.apiKey! },
    });
    if (!resp.ok) {
      throw new Error(`Composio tools API returned ${resp.status}`);
    }
    const data = (await resp.json()) as { items?: unknown[] };
    const items = Array.isArray(data.items) ? data.items : [];
    const mapped: ComposioToolSummary[] = items.map((item: Record<string, unknown>) => {
      const tk = (item.toolkit as Record<string, string>) ?? {};
      return {
        slug: String(item.slug ?? ''),
        name: String(item.name ?? item.slug ?? ''),
        description: String(item.description ?? ''),
        toolkit: {
          slug: String(tk.slug ?? key),
          name: String(tk.name ?? key),
          logo: String(tk.logo ?? `https://logos.composio.dev/api/${key}`),
        },
      };
    });
    this.toolsCache.set(key, { ts: now, data: mapped });
    return mapped;
  }

  async listToolkitTriggers(toolkitSlug: string): Promise<ComposioTriggerSummary[]> {
    const key = toolkitSlug.trim().toLowerCase();
    const now = Date.now();
    const cached = this.triggersCache.get(key);
    if (cached && now - cached.ts < this.CACHE_TTL_MS) {
      return cached.data;
    }

    if (!this.isConfigured()) {
      return [];
    }

    const url = new URL('https://backend.composio.dev/api/v3.1/triggers_types');
    url.searchParams.set('toolkit_slugs', key);
    url.searchParams.set('toolkit_versions', 'latest');
    url.searchParams.set('limit', '500');

    const resp = await fetch(url.toString(), {
      headers: { 'x-api-key': this.config.composio.apiKey! },
    });
    if (!resp.ok) {
      throw new Error(`Composio triggers API returned ${resp.status}`);
    }

    const data = (await resp.json()) as { items?: unknown[] };
    const items = Array.isArray(data.items) ? data.items : [];
    const mapped: ComposioTriggerSummary[] = items.map((item: Record<string, unknown>) => {
      const tk = (item.toolkit as Record<string, string>) ?? {};
      return {
        slug: String(item.slug ?? ''),
        name: String(item.name ?? item.slug ?? ''),
        description: String(item.description ?? ''),
        type: (item.type === 'poll' ? 'poll' : 'webhook') as 'webhook' | 'poll',
        toolkit: {
          slug: String(tk.slug ?? key),
          name: String(tk.name ?? key),
          logo: String(tk.logo ?? `https://logos.composio.dev/api/${key}`),
        },
        config: (item.config as Record<string, unknown>) ?? {},
        payload: (item.payload as Record<string, unknown>) ?? {},
      };
    });

    this.triggersCache.set(key, { ts: now, data: mapped });
    return mapped;
  }

  /** True when Composio exposes at least one trigger for this toolkit (per-toolkit API, cached). */
  async toolkitHasTriggers(toolkitSlug: string): Promise<boolean> {
    const triggers = await this.listToolkitTriggers(toolkitSlug);
    return triggers.length > 0;
  }

  async upsertTriggerInstance(
    triggerSlug: string,
    composioConnectionId: string,
    triggerConfig: Record<string, unknown> = {},
  ): Promise<{ id: string; status?: string }> {
    if (!this.isConfigured()) {
      throw new Error('COMPOSIO_API_KEY is not configured');
    }
    const slug = triggerSlug.trim().toUpperCase();
    const url = `https://backend.composio.dev/api/v3.1/trigger_instances/${encodeURIComponent(slug)}/upsert`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': this.config.composio.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connected_account_id: composioConnectionId,
        trigger_config: triggerConfig,
        toolkit_versions: 'latest',
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Composio trigger upsert failed (${resp.status}): ${text.slice(0, 300)}`);
    }
    const body = (await resp.json()) as Record<string, unknown>;
    const id = String(
      body.id ?? body.trigger_id ?? body.triggerId ?? body.nano_id ?? body.nanoId ?? '',
    );
    if (!id) {
      throw new Error('Composio trigger upsert did not return an instance id');
    }
    return { id, status: String(body.status ?? body.state ?? 'active') };
  }

  async disableTriggerInstance(externalId: string): Promise<void> {
    if (!this.isConfigured()) return;
    const url = `https://backend.composio.dev/api/v3.1/trigger_instances/${encodeURIComponent(externalId)}/disable`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'x-api-key': this.config.composio.apiKey! },
    });
    if (!resp.ok && resp.status !== 404) {
      this.logger.warn(`Composio disable trigger ${externalId}: HTTP ${resp.status}`);
    }
  }

  async executeAction(
    entityId: string,
    composioConnectionId: string,
    actionSlug: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const composio = this.getClient();
    const result = await composio.tools.execute(actionSlug, {
      userId: entityId,
      connectedAccountId: composioConnectionId,
      arguments: args,
    });
    return result;
  }

  async getAgentTools(
    entityId: string,
    toolSlugs: string[],
    composioConnectionId: string,
  ): Promise<Tool[]> {
    if (!toolSlugs.length) return [];
    const composio = this.getClient();
    const tools = await composio.tools.get(
      entityId,
      { tools: toolSlugs },
      {
        beforeExecute: ({ params }: { params: Record<string, unknown> }) => ({
          ...params,
          connectedAccountId: composioConnectionId,
          dangerouslySkipVersionCheck: true,
        }),
      },
    );
    return Array.isArray(tools) ? tools : [];
  }
}
