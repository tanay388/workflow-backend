import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CryptoService } from '../common/crypto/crypto.service';
import { AppConfigService } from '../common/config/config.service';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { randomToken } from '../common/utils/ids';
import { Workflow } from '../workflows/entities/workflow.entity';
import { InboundWebhook } from './entities/inbound-webhook.entity';

@Injectable()
export class InboundWebhookService {
  constructor(
    @InjectRepository(InboundWebhook)
    private readonly webhooks: Repository<InboundWebhook>,
    @InjectRepository(Workflow)
    private readonly workflows: Repository<Workflow>,
    private readonly crypto: CryptoService,
    private readonly config: AppConfigService,
  ) {}

  async getForWorkflow(tenancy: Tenancy, workflowId: string) {
    await this.assertWorkflow(tenancy, workflowId);
    const row = await this.webhooks.findOne({
      where: {
        orgId: tenancy.orgId,
        workspaceId: tenancy.workspaceId,
        workflowId,
        deletedAt: IsNull(),
      },
    });
    if (!row) return null;
    return this.toPublicDto(row);
  }

  async mint(
    tenancy: Tenancy,
    workflowId: string,
    userId: string,
    regenerate = false,
  ): Promise<{ webhook: ReturnType<InboundWebhookService['toPublicDto']>; signing_secret?: string }> {
    await this.assertWorkflow(tenancy, workflowId);

    const signingSecret = randomToken(32);
    const encrypted = this.crypto.encrypt(signingSecret, `inbound:${workflowId}`);

    let row = await this.webhooks.findOne({
      where: {
        orgId: tenancy.orgId,
        workspaceId: tenancy.workspaceId,
        workflowId,
        deletedAt: IsNull(),
      },
    });

    if (row && !regenerate) {
      return { webhook: this.toPublicDto(row) };
    }

    if (row && regenerate) {
      row.pathToken = randomToken(24);
      row.signingSecret = encrypted.toString('base64');
      row.updatedBy = userId;
      await this.webhooks.save(row);
      return { webhook: this.toPublicDto(row), signing_secret: signingSecret };
    }

    row = this.webhooks.create({
      orgId: tenancy.orgId!,
      workspaceId: tenancy.workspaceId!,
      workflowId,
      pathToken: randomToken(24),
      signingSecret: encrypted.toString('base64'),
      enabled: true,
      createdBy: userId,
    });
    const saved = await this.webhooks.save(row);
    return { webhook: this.toPublicDto(saved), signing_secret: signingSecret };
  }

  async findByPathToken(pathToken: string): Promise<InboundWebhook | null> {
    return this.webhooks.findOne({
      where: { pathToken, enabled: true, deletedAt: IsNull() },
    });
  }

  getSigningSecret(row: InboundWebhook): string {
    return this.crypto.decrypt(Buffer.from(row.signingSecret, 'base64'), `inbound:${row.workflowId}`);
  }

  private async assertWorkflow(tenancy: Tenancy, workflowId: string): Promise<void> {
    const wf = await this.workflows.findOne({
      where: { id: workflowId, orgId: tenancy.orgId, workspaceId: tenancy.workspaceId },
    });
    if (!wf) throw new NotFoundException('Workflow not found');
  }

  private toPublicDto(row: InboundWebhook) {
    const base = this.config.triggers.apiPublicUrl;
    return {
      id: row.id,
      workflow_id: row.workflowId,
      path_token: row.pathToken,
      url: `${base}/webhooks/in/${row.pathToken}`,
      enabled: row.enabled,
      created_at: row.createdAt.toISOString(),
    };
  }
}
