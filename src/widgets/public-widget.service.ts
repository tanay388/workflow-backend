import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from '../common/config/config.service';
import { RecaptchaVerifier } from '../common/recaptcha/recaptcha.verifier';
import { isOriginAllowed } from '../common/widget/origin-allowlist';
import { FormService } from '../forms/form.service';
import type { FormFieldSchema } from '../forms/entities/form.entity';
import { ensureNameFieldFirst } from '../forms/required-name-field';
import type { ChatWidget, WidgetBranding } from './entities/chat-widget.entity';
import { TtlCache } from '../common/cache/ttl-cache';
import { WidgetService } from './widget.service';

const WIDGET_CONFIG_CACHE_MS = 30_000;

export interface ResolvedWidget {
  widget: ChatWidget;
  origin: string;
}

export interface PublicWidgetConfigDto {
  branding: WidgetBranding;
  formSchema: FormFieldSchema[];
  collectContact: boolean;
  recaptchaEnabled: boolean;
  recaptchaSiteKey: string | null;
  suggestedPrompts: string[];
}

@Injectable()
export class PublicWidgetService {
  private readonly configByWidgetId = new TtlCache<string, PublicWidgetConfigDto>(
    WIDGET_CONFIG_CACHE_MS,
  );

  constructor(
    private readonly widgets: WidgetService,
    private readonly forms: FormService,
    private readonly recaptcha: RecaptchaVerifier,
    private readonly config: AppConfigService,
  ) {}

  assertPayloadSize(body: unknown): void {
    const json = JSON.stringify(body ?? {});
    if (Buffer.byteLength(json, 'utf8') > this.config.widget.maxPayloadBytes) {
      throw new PayloadTooLargeException('Request body too large');
    }
  }

  async resolveFromRequest(
    publicKey: string,
    req: Request,
  ): Promise<ResolvedWidget> {
    const widget = await this.widgets.findByPublicKey(publicKey);
    if (!widget) throw new NotFoundException('Widget not found');

    const origin = req.headers.origin as string | undefined;
    const referer = req.headers.referer as string | undefined;
    if (
      !isOriginAllowed(widget.allowedDomains ?? [], origin, referer, {
        allowAllOrigins: widget.allowAllOrigins,
        corsOrigins: widget.allowCorsOrigins
          ? this.config.corsOrigins
          : undefined,
      })
    ) {
      throw new ForbiddenException('Origin not allowed');
    }

    const resolvedOrigin =
      origin?.trim() ||
      (referer ? new URL(referer).origin : '');
    return { widget, origin: resolvedOrigin };
  }

  async getConfig(resolved: ResolvedWidget): Promise<PublicWidgetConfigDto> {
    const cached = this.configByWidgetId.get(resolved.widget.id);
    if (cached) return cached;

    const form = await this.forms.findPublishedForWidget(
      resolved.widget.id,
      resolved.widget.workflowId,
    );
    const branding = resolved.widget.branding ?? {};
    const dto: PublicWidgetConfigDto = {
      branding,
      formSchema: form?.schema?.length
        ? ensureNameFieldFirst(form.schema)
        : [],
      collectContact: resolved.widget.collectContact,
      recaptchaEnabled: resolved.widget.recaptchaEnabled,
      recaptchaSiteKey: resolved.widget.recaptchaEnabled
        ? (this.config.recaptcha.siteKey ?? null)
        : null,
      suggestedPrompts: branding.suggestedPrompts ?? [],
    };
    this.configByWidgetId.set(resolved.widget.id, dto);
    return dto;
  }

  async verifyRecaptchaIfNeeded(
    widget: ChatWidget,
    token: string | undefined,
    remoteIp?: string,
  ): Promise<void> {
    if (!widget.recaptchaEnabled) return;
    const result = await this.recaptcha.verify(token, remoteIp);
    if (!result.ok) {
      throw new UnauthorizedException('reCAPTCHA verification failed');
    }
  }

  setCorsHeaders(res: { setHeader: (k: string, v: string) => void }, origin: string): void {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  handleOptions(req: Request, res: { setHeader: (k: string, v: string) => void; status: (n: number) => { end: () => void } }): void {
    const origin = req.headers.origin as string | undefined;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Visitor-Token');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    res.status(204).end();
  }
}
