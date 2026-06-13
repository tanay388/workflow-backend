import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

interface Window {
  count: number;
  resetAt: number;
}

/**
 * In-process sliding-window rate limiter (TRD §3 common services).
 * Phase 02 uses it on `/auth/*` (per IP + per email). A distributed store
 * (Redis) can replace this implementation later without changing callers.
 */
@Injectable()
export class RateLimitService {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly config: AppConfigService) {}

  /** Throws 429 when the key exceeds the configured limit within the window. */
  consume(key: string, overrides?: { max?: number; windowMs?: number }): void {
    const max = overrides?.max ?? this.config.authRateLimit.max;
    const windowMs = overrides?.windowMs ?? this.config.authRateLimit.windowMs;
    const now = Date.now();
    const existing = this.windows.get(key);

    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    if (existing.count >= max) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    existing.count += 1;
  }

  /** Convenience for auth endpoints: throttle by client IP and email. */
  consumeAuth(endpoint: string, ip: string, email?: string): void {
    this.consume(`auth:ip:${endpoint}:${ip}`);
    if (email) {
      this.consume(`auth:email:${endpoint}:${email.toLowerCase()}`);
    }
  }

  /**
   * Token refresh happens on every page load with a session, so it uses its
   * own (much looser) bucket than the credential endpoints.
   */
  consumeRefresh(ip: string): void {
    this.consume(`auth:ip:refresh:${ip}`, this.config.refreshRateLimit);
  }

  /** Test helper — clears all counters. */
  reset(): void {
    this.windows.clear();
  }
}
