import { z } from 'zod';

/**
 * The single source of truth for environment variables (TRD §3.1).
 * This is the ONLY place process.env is read/validated; everything else
 * consumes typed values via {@link AppConfigService}.
 *
 * Validation runs at boot and fails fast on missing/invalid values
 * (Phase 01 DoD: missing/invalid APP_ENCRYPTION_KEY fails fast at boot).
 */
// Parse a "true"/"false" env string into a boolean, defaulting before
// transform (zod v4 applies .default() to the post-transform type).
const booleanString = (def: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true');

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // ─── Database — exactly one pool per process (TRD §1, §15) ───────────────
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: booleanString('false'),

  // ─── Secrets crypto (TRD §10.3) ─────────────────────────────────────────
  // 32-byte key, base64-encoded. Versioned so keys can rotate without a
  // big-bang re-encrypt (decrypt-old / encrypt-new).
  APP_ENCRYPTION_KEY: z.string().min(1, 'APP_ENCRYPTION_KEY is required (base64-encoded 32 bytes)'),
  APP_ENCRYPTION_KEY_ID: z.string().min(1).default('v1'),
  // Optional JSON map of retired keys for decrypt: {"v0":"<base64-32-bytes>"}
  APP_ENCRYPTION_KEYS_OLD: z.string().optional(),

  // ─── Email (TRD §10.1) — optional in dev; logs instead of sending ───────
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: booleanString('false'),
  EMAIL_FROM: z.string().default('Growy <no-reply@growy.local>'),

  // ─── Logging (TRD §15) ──────────────────────────────────────────────────
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // ─── CORS allowlist (TRD §10.2) — comma-separated origins ───────────────
  CORS_ORIGINS: z.string().default('http://localhost:3001'),

  // ─── Auth (TRD §10.1, Phase 02) ─────────────────────────────────────────
  JWT_SECRET: z.string().min(16, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(65536),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(3),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(4),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),

  // ─── IAM (Phase 03) ─────────────────────────────────────────────────────
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  INVITATION_EXPIRES_IN: z.string().default('7d'),
});

export type AppEnv = z.infer<typeof configSchema>;

/**
 * Validate raw environment into a typed config object. Passed to
 * `@nestjs/config` so an invalid environment aborts boot with a clear message.
 */
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
