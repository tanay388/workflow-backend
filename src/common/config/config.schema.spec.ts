import { validateEnv } from './config.schema';

const KEY = Buffer.alloc(32, 1).toString('base64');
const base = {
  DATABASE_URL: 'postgres://localhost/test',
  APP_ENCRYPTION_KEY: KEY,
  JWT_SECRET: 'test-jwt-secret-min-16-chars',
};

describe('validateEnv', () => {
  it('parses a valid env and applies defaults', () => {
    const env = validateEnv({ ...base });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_SSL).toBe(false);
    expect(env.APP_ENCRYPTION_KEY_ID).toBe('v1');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('fails fast when APP_ENCRYPTION_KEY is missing', () => {
    expect(() => validateEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/APP_ENCRYPTION_KEY/);
  });

  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ APP_ENCRYPTION_KEY: KEY })).toThrow(/DATABASE_URL/);
  });

  it('coerces PORT and parses boolean strings', () => {
    const env = validateEnv({ ...base, PORT: '8080', DATABASE_SSL: 'true' });
    expect(env.PORT).toBe(8080);
    expect(env.DATABASE_SSL).toBe(true);
  });

  it('rejects an invalid LOG_LEVEL', () => {
    expect(() => validateEnv({ ...base, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });
});
