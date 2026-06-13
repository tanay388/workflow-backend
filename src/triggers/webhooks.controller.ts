import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { SkipTenancy } from '../common/decorators/skip-tenancy.decorator';
import { AppConfigService } from '../common/config/config.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { TriggerSubscriptionService } from './trigger-subscription.service';
import { TriggerIngestService } from './trigger-ingest.service';
import { InboundWebhookService } from './inbound-webhook.service';
import { ComposioSignatureVerifier } from './verifiers/composio-signature.verifier';
import { HmacVerifier } from './verifiers/hmac.verifier';
import { InternalWebhookDto } from './dto/trigger.dto';

type RawBodyRequest = Request & { rawBody?: Buffer };

@ApiTags('webhooks')
@Controller('webhooks')
@Public()
@SkipTenancy()
export class WebhooksController {
  constructor(
    private readonly composioVerify: ComposioSignatureVerifier,
    private readonly hmac: HmacVerifier,
    private readonly subscriptions: TriggerSubscriptionService,
    private readonly inboundWebhooks: InboundWebhookService,
    private readonly ingest: TriggerIngestService,
    private readonly config: AppConfigService,
    private readonly crypto: CryptoService,
  ) {}

  @Post('composio')
  async composio(@Req() req: RawBodyRequest, @Headers() headers: Record<string, string>) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const rawStr = raw.toString('utf8');

    if (!this.composioVerify.verify(rawStr, headers)) {
      throw new UnauthorizedException('Invalid Composio webhook signature');
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawStr) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid JSON body');
    }

    const externalId = String(
      payload.trigger_id ??
        payload.triggerId ??
        payload.trigger_nano_id ??
        payload.triggerNanoId ??
        payload.id ??
        '',
    );
    if (!externalId) {
      throw new BadRequestException('Missing trigger id in payload');
    }

    const idempotencyKey = String(
      payload.delivery_id ??
        payload.deliveryId ??
        payload.idempotency_key ??
        payload.message_id ??
        `${externalId}:${payload.timestamp ?? Date.now()}`,
    );

    const sub = await this.subscriptions.resolveByExternalId(externalId);
    if (!sub) {
      return { ok: true, ignored: true };
    }

    // One delivery may wake several paused runs bound to this trigger; a new
    // run is only started for workflow-level triggers with nothing to resume.
    const boundRunIds = await this.ingest.findPausedBindingRuns(sub.orgId, externalId, payload);

    const eventPayload =
      (payload.data as Record<string, unknown>) ??
      (payload.payload as Record<string, unknown>) ??
      payload;

    await this.ingest.ingest({
      orgId: sub.orgId,
      workspaceId: sub.workspaceId,
      workflowId: sub.workflowId,
      source: 'composio',
      idempotencyKey,
      triggerSource: 'external_event',
      input: eventPayload,
      runBy: { type: 'trigger', id: sub.id, label: sub.eventSlug ?? 'event' },
      triggerMetadata: {
        subscription_id: sub.id,
        external_id: externalId,
        delivery_id: idempotencyKey,
      },
      boundRunIds,
      allowNewRun: sub.isWorkflowTrigger(),
    });

    return { ok: true };
  }

  @Post('in/:pathToken')
  async inbound(
    @Param('pathToken') pathToken: string,
    @Req() req: RawBodyRequest,
    @Headers('x-growy-signature') signature?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const row = await this.inboundWebhooks.findByPathToken(pathToken);
    if (!row) {
      throw new UnauthorizedException('Unknown webhook');
    }

    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const secret = this.inboundWebhooks.getSigningSecret(row);

    if (!this.hmac.verify(raw, secret, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const key =
      idempotencyKey?.trim() ||
      this.crypto.hashSha256(`${pathToken}:${raw.toString('utf8')}`);

    let input: unknown = {};
    try {
      input = JSON.parse(raw.toString('utf8'));
    } catch {
      input = { body: raw.toString('utf8') };
    }

    await this.ingest.ingest({
      orgId: row.orgId,
      workspaceId: row.workspaceId,
      workflowId: row.workflowId,
      source: 'inbound',
      idempotencyKey: key,
      triggerSource: 'inbound_webhook',
      input,
      runBy: { type: 'trigger', id: row.id, label: 'Inbound webhook' },
      triggerMetadata: { inbound_webhook_id: row.id, path_token: pathToken },
    });

    return { ok: true };
  }

  @Post('internal')
  async internal(@Body() dto: InternalWebhookDto, @Headers('x-internal-secret') secret?: string) {
    const expected = this.config.triggers.internalWebhookSecret;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid internal webhook secret');
    }

    await this.ingest.ingest({
      orgId: dto.org_id,
      workspaceId: dto.workspace_id,
      workflowId: dto.workflow_id,
      source: 'internal',
      idempotencyKey: dto.idempotency_key,
      triggerSource: 'platform_event',
      input: dto.input ?? {},
      runBy: { type: 'trigger', id: 'internal', label: 'Platform event' },
      boundRunIds: dto.bound_run_id ? [dto.bound_run_id] : null,
    });

    return { ok: true };
  }
}
