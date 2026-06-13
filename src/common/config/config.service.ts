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
      .map((entry) => {
        const trimmed = entry.trim();
        if (!trimmed) return null;
        try {
          return trimmed.includes('://') ? new URL(trimmed).origin : trimmed.replace(/\/+$/, '');
        } catch {
          return trimmed.replace(/\/+$/, '') || null;
        }
      })
      .filter((o): o is string => Boolean(o));
  }

  get jwt(): {
    secret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
    platformSecret: string;
    platformExpiresIn: string;
  } {
    const secret = this.get('JWT_SECRET');
    return {
      secret,
      accessExpiresIn: this.get('JWT_EXPIRES_IN'),
      refreshExpiresIn: this.get('JWT_REFRESH_EXPIRES_IN'),
      platformSecret: this.get('JWT_PLATFORM_SECRET') ?? `${secret}:platform`,
      platformExpiresIn: this.get('JWT_PLATFORM_EXPIRES_IN'),
    };
  }

  get platformAdminBootstrap(): {
    email?: string;
    password?: string;
    name: string;
  } {
    return {
      email: this.get('PLATFORM_ADMIN_EMAIL'),
      password: this.get('PLATFORM_ADMIN_PASSWORD'),
      name: this.get('PLATFORM_ADMIN_NAME'),
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

  get refreshRateLimit(): { max: number; windowMs: number } {
    return {
      max: this.get('AUTH_REFRESH_RATE_LIMIT_MAX'),
      windowMs: this.get('AUTH_REFRESH_RATE_LIMIT_WINDOW_MS'),
    };
  }

  get frontendUrl(): string {
    return this.get('FRONTEND_URL').replace(/\/$/, '');
  }

  get invitationExpiresIn(): string {
    return this.get('INVITATION_EXPIRES_IN');
  }

  get worker(): {
    enabled: boolean;
    maxSteps: number;
    dispatchBatch: number;
    executorPoolSize: number;
    dispatchIntervalMs: number;
    stalledMinutes: number;
  } {
    return {
      enabled: this.get('WORKER_ENABLED'),
      maxSteps: this.get('ENGINE_MAX_STEPS'),
      dispatchBatch: this.get('ENGINE_DISPATCH_BATCH'),
      executorPoolSize: this.get('ENGINE_EXECUTOR_POOL_SIZE'),
      dispatchIntervalMs: this.get('ENGINE_DISPATCH_INTERVAL_MS'),
      stalledMinutes: this.get('ENGINE_STALLED_MINUTES'),
    };
  }

  get scheduler(): { tickIntervalMs: number } {
    return { tickIntervalMs: this.get('SCHEDULER_TICK_INTERVAL_MS') };
  }

  get openaiApiKey(): string | undefined {
    return this.get('OPENAI_API_KEY');
  }

  get composio(): { apiKey?: string; webhookSecret?: string } {
    return {
      apiKey: this.get('COMPOSIO_API_KEY'),
      webhookSecret: this.get('COMPOSIO_WEBHOOK_SECRET'),
    };
  }

  get triggers(): {
    apiPublicUrl: string;
    internalWebhookSecret?: string;
    chainMaxDepth: number;
  } {
    return {
      apiPublicUrl: this.get('API_PUBLIC_URL').replace(/\/$/, ''),
      internalWebhookSecret: this.get('INTERNAL_WEBHOOK_SECRET'),
      chainMaxDepth: this.get('TRIGGER_CHAIN_MAX_DEPTH'),
    };
  }

  get recaptcha(): {
    secretKey?: string;
    siteKey?: string;
    minScore: number;
  } {
    return {
      secretKey: this.get('RECAPTCHA_SECRET_KEY'),
      siteKey: this.get('RECAPTCHA_SITE_KEY'),
      minScore: this.get('RECAPTCHA_MIN_SCORE'),
    };
  }

  get widget(): {
    embedBaseUrl: string;
    apiPublicUrl: string;
    maxPayloadBytes: number;
  } {
    const apiPublic = this.get('API_PUBLIC_URL').replace(/\/$/, '');
    const embed =
      this.get('WIDGET_EMBED_BASE_URL')?.replace(/\/$/, '') ??
      `${apiPublic}/widget`;
    return {
      embedBaseUrl: embed,
      apiPublicUrl: apiPublic,
      maxPayloadBytes: this.get('WIDGET_MAX_PAYLOAD_BYTES'),
    };
  }

  get defaultPricePerMillionUsd(): number {
    return this.get('DEFAULT_PRICE_PER_MILLION_USD');
  }

  get agentMaxToolsPerToolkit(): number {
    return this.get('AGENT_MAX_TOOLS_PER_TOOLKIT');
  }

  get chatHistoryTokenBudget(): number {
    return this.get('CHAT_HISTORY_TOKEN_BUDGET');
  }

  get chatRecentMessagesKeep(): number {
    return this.get('CHAT_RECENT_MESSAGES_KEEP');
  }

  get chatSummaryModel(): string {
    return this.get('CHAT_SUMMARY_MODEL');
  }

  get engineAgentTimeoutSeconds(): number {
    return this.get('ENGINE_AGENT_TIMEOUT_SECONDS');
  }

  get engineAgentTimeoutMaxSeconds(): number {
    return this.get('ENGINE_AGENT_TIMEOUT_MAX_SECONDS');
  }

  get spaces(): {
    endpoint?: string;
    bucket?: string;
    accessKey?: string;
    secretKey?: string;
    region?: string;
    enabled: boolean;
  } {
    const endpoint = this.get('SPACES_ENDPOINT');
    const bucket = this.get('SPACES_BUCKET');
    const accessKey = this.get('SPACES_ACCESS_KEY');
    const secretKey = this.get('SPACES_SECRET_KEY');
    return {
      endpoint,
      bucket,
      accessKey,
      secretKey,
      region: this.get('SPACES_REGION'),
      enabled: Boolean(endpoint && bucket && accessKey && secretKey),
    };
  }
}
