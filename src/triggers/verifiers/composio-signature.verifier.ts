import { Injectable, Logger } from '@nestjs/common';
import { Webhook } from 'standardwebhooks';
import { AppConfigService } from '../../common/config/config.service';

@Injectable()
export class ComposioSignatureVerifier {
  private readonly logger = new Logger(ComposioSignatureVerifier.name);
  private wh: Webhook | null = null;

  constructor(private readonly config: AppConfigService) {
    const secret = this.config.composio.webhookSecret;
    if (secret) {
      this.wh = new Webhook(secret);
    }
  }

  isConfigured(): boolean {
    return Boolean(this.wh);
  }

  verify(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean {
    if (!this.wh) {
      this.logger.error('COMPOSIO_WEBHOOK_SECRET is not set — rejecting delivery');
      return false;
    }
    const id = header(headers, 'webhook-id');
    const timestamp = header(headers, 'webhook-timestamp');
    const signature = header(headers, 'webhook-signature');
    if (!id || !timestamp || !signature) {
      return false;
    }
    try {
      this.wh.verify(rawBody, { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature });
      return true;
    } catch {
      return false;
    }
  }
}

function header(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return v;
}
