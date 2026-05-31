import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from './config.schema';

/**
 * Typed accessors over the validated environment (TRD §3.1).
 * Inject this instead of reading `process.env` directly anywhere in the app.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  private get<K extends keyof AppEnv>(key: K): AppEnv[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): AppEnv['NODE_ENV'] {
    return this.get('NODE_ENV');
  }
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }
  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }
  get port(): number {
    return this.get('PORT');
  }

  get database(): { url: string; ssl: boolean } {
    return { url: this.get('DATABASE_URL'), ssl: this.get('DATABASE_SSL') };
  }

  get encryption(): {
    activeKeyId: string;
    activeKey: string;
    oldKeysJson?: string;
  } {
    return {
      activeKeyId: this.get('APP_ENCRYPTION_KEY_ID'),
      activeKey: this.get('APP_ENCRYPTION_KEY'),
      oldKeysJson: this.get('APP_ENCRYPTION_KEYS_OLD'),
    };
  }

  get smtp(): {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    secure: boolean;
    from: string;
  } {
    return {
      host: this.get('SMTP_HOST'),
      port: this.get('SMTP_PORT'),
      user: this.get('SMTP_USER'),
      password: this.get('SMTP_PASSWORD'),
      secure: this.get('SMTP_SECURE'),
      from: this.get('EMAIL_FROM'),
    };
  }

  get logLevel(): AppEnv['LOG_LEVEL'] {
    return this.get('LOG_LEVEL');
  }

  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  get jwt(): {
    secret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  } {
    return {
      secret: this.get('JWT_SECRET'),
      accessExpiresIn: this.get('JWT_EXPIRES_IN'),
      refreshExpiresIn: this.get('JWT_REFRESH_EXPIRES_IN'),
    };
  }

  get argon2(): { memoryCost: number; timeCost: number; parallelism: number } {
    return {
      memoryCost: this.get('ARGON2_MEMORY_COST'),
      timeCost: this.get('ARGON2_TIME_COST'),
      parallelism: this.get('ARGON2_PARALLELISM'),
    };
  }

  get otp(): { ttlMinutes: number; maxAttempts: number } {
    return {
      ttlMinutes: this.get('OTP_TTL_MINUTES'),
      maxAttempts: this.get('OTP_MAX_ATTEMPTS'),
    };
  }

  get authRateLimit(): { max: number; windowMs: number } {
    return {
      max: this.get('AUTH_RATE_LIMIT_MAX'),
      windowMs: this.get('AUTH_RATE_LIMIT_WINDOW_MS'),
    };
  }

  get frontendUrl(): string {
    return this.get('FRONTEND_URL').replace(/\/$/, '');
  }

  get invitationExpiresIn(): string {
    return this.get('INVITATION_EXPIRES_IN');
  }
}
