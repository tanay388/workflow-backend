import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

export interface RecaptchaVerifyResult {
  ok: boolean;
  score?: number;
  action?: string;
  error?: string;
}

@Injectable()
export class RecaptchaVerifier {
  private readonly logger = new Logger(RecaptchaVerifier.name);

  constructor(private readonly config: AppConfigService) {}

  /** Verify a reCAPTCHA v3 token with Google. Skips when disabled or no secret configured. */
  async verify(token: string | undefined, remoteIp?: string): Promise<RecaptchaVerifyResult> {
    const { secretKey, minScore } = this.config.recaptcha;
    if (!secretKey) {
      return { ok: true, action: 'skipped' };
    }
    if (!token?.trim()) {
      return { ok: false, error: 'missing_token' };
    }

    const body = new URLSearchParams({
      secret: secretKey,
      response: token.trim(),
    });
    if (remoteIp) body.set('remoteip', remoteIp);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);

    try {
      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
      const json = (await res.json()) as {
        success?: boolean;
        score?: number;
        action?: string;
        'error-codes'?: string[];
      };

      if (!json.success) {
        return {
          ok: false,
          error: json['error-codes']?.join(',') ?? 'verification_failed',
        };
      }

      const score = typeof json.score === 'number' ? json.score : 1;
      if (score < minScore) {
        return { ok: false, score, action: json.action, error: 'score_too_low' };
      }

      return { ok: true, score, action: json.action };
    } catch (err) {
      this.logger.warn(`reCAPTCHA verify failed: ${String(err)}`);
      return { ok: false, error: 'timeout' };
    } finally {
      clearTimeout(timeout);
    }
  }
}
