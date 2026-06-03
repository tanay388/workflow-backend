import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CryptoService } from '../common/crypto/crypto.service';
import { AppConfigService } from '../common/config/config.service';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { randomToken } from '../common/utils/ids';
import { Workflow } from '../workflows/entities/workflow.entity';
import { TtlCache } from '../common/cache/ttl-cache';
import { ChatWidget, type WidgetBranding } from './entities/chat-widget.entity';

const WIDGET_PUBLIC_KEY_CACHE_MS = 60_000;

export interface WidgetConfigDto {
  id: string;
  workflowId: string;
  publicKey: string;
  enabled: boolean;
  allowedDomains: string[];
  allowCorsOrigins: boolean;
  allowAllOrigins: boolean;
  branding: WidgetBranding;
  collectContact: boolean;
  rateLimitPerDay: number;
  recaptchaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class WidgetService {
  private readonly byPublicKey = new TtlCache<string, ChatWidget>(
    WIDGET_PUBLIC_KEY_CACHE_MS,
  );

  constructor(
    @InjectRepository(ChatWidget) private readonly widgets: Repository<ChatWidget>,
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
    private readonly crypto: CryptoService,
    private readonly config: AppConfigService,
  ) {}

  async getForWorkflow(tenancy: Tenancy, workflowId: string): Promise<WidgetConfigDto | null> {
    await this.assertWorkflow(tenancy, workflowId);
    const row = await this.widgets.findOne({
      where: {
        workflowId,
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        deletedAt: IsNull(),
      },
    });
    return row ? this.toDto(row) : null;
  }

  async publish(tenancy: Tenancy, workflowId: string, userId: string): Promise<WidgetConfigDto> {
    await this.assertWorkflow(tenancy, workflowId);
    const existing = await this.widgets.findOne({
      where: {
        workflowId,
        orgId: tenancy.orgId!,
        deletedAt: IsNull(),
      },
    });
    if (existing) {
      existing.enabled = true;
      existing.updatedBy = userId;
      return this.toDto(await this.widgets.save(existing));
    }

    const publicKey = `gw_${randomToken(16)}`;
    const signingPlain = randomToken(32);
    const widget = this.widgets.create({
      orgId: tenancy.orgId!,
      workspaceId: tenancy.workspaceId!,
      workflowId,
      publicKey,
      signingSecret: Buffer.alloc(0),
      enabled: true,
      allowedDomains: [],
      branding: {
        name: 'Chat',
        welcomeMessage: 'Hi! How can we help you today?',
        suggestedPrompts: [],
      },
      createdBy: userId,
    });
    const saved = await this.widgets.save(widget);
    const aad = this.signingAad(saved);
    saved.signingSecret = this.crypto.encrypt(signingPlain, aad);
    await this.widgets.save(saved);
    return this.toDto(saved);
  }

  async update(
    tenancy: Tenancy,
    widgetId: string,
    userId: string,
    patch: Partial<{
      enabled: boolean;
      allowedDomains: string[];
      allowCorsOrigins: boolean;
      allowAllOrigins: boolean;
      branding: WidgetBranding;
      collectContact: boolean;
      rateLimitPerDay: number;
      recaptchaEnabled: boolean;
    }>,
  ): Promise<WidgetConfigDto> {
    const row = await this.findScoped(tenancy, widgetId);
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (patch.allowedDomains !== undefined) row.allowedDomains = patch.allowedDomains;
    if (patch.allowCorsOrigins !== undefined) row.allowCorsOrigins = patch.allowCorsOrigins;
    if (patch.allowAllOrigins !== undefined) row.allowAllOrigins = patch.allowAllOrigins;
    if (patch.branding !== undefined) row.branding = { ...row.branding, ...patch.branding };
    if (patch.collectContact !== undefined) row.collectContact = patch.collectContact;
    if (patch.rateLimitPerDay !== undefined) row.rateLimitPerDay = patch.rateLimitPerDay;
    if (patch.recaptchaEnabled !== undefined) row.recaptchaEnabled = patch.recaptchaEnabled;
    row.updatedBy = userId;
    const saved = await this.widgets.save(row);
    this.byPublicKey.delete(saved.publicKey);
    return this.toDto(saved);
  }

  async softDelete(tenancy: Tenancy, widgetId: string, userId: string): Promise<void> {
    const row = await this.findScoped(tenancy, widgetId);
    await this.widgets.update(row.id, {
      enabled: false,
      deletedAt: new Date(),
      deletedBy: userId,
    });
  }

  embedSnippet(publicKey: string): string {
    const { embedBaseUrl, apiPublicUrl } = this.config.widget;
    return `<script src="${embedBaseUrl}/embed.js" data-public-key="${publicKey}" data-api-base="${apiPublicUrl}" async></script>`;
  }

  async findByPublicKey(publicKey: string): Promise<ChatWidget | null> {
    const cached = this.byPublicKey.get(publicKey);
    if (cached) return cached;
    const row = await this.widgets.findOne({
      where: { publicKey, deletedAt: IsNull(), enabled: true },
    });
    if (row) this.byPublicKey.set(publicKey, row);
    return row;
  }

  async findScoped(tenancy: Tenancy, widgetId: string): Promise<ChatWidget> {
    const row = await this.widgets.findOne({
      where: {
        id: widgetId,
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        deletedAt: IsNull(),
      },
    });
    if (!row) throw new NotFoundException('Widget not found');
    return row;
  }

  signingAad(widget: ChatWidget): string {
    return `org:${widget.orgId}:widget:${widget.id}`;
  }

  private async assertWorkflow(tenancy: Tenancy, workflowId: string): Promise<void> {
    const wf = await this.workflows.findOne({
      where: {
        id: workflowId,
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        deletedAt: IsNull(),
      },
    });
    if (!wf) throw new NotFoundException('Workflow not found');
  }

  private toDto(row: ChatWidget): WidgetConfigDto {
    return {
      id: row.id,
      workflowId: row.workflowId,
      publicKey: row.publicKey,
      enabled: row.enabled,
      allowedDomains: row.allowedDomains ?? [],
      allowCorsOrigins: row.allowCorsOrigins ?? false,
      allowAllOrigins: row.allowAllOrigins ?? false,
      branding: row.branding ?? {},
      collectContact: row.collectContact,
      rateLimitPerDay: row.rateLimitPerDay,
      recaptchaEnabled: row.recaptchaEnabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
