import type { ClientConfig } from 'pg';

/** Shared pg.Client options — must match {@link DatabaseModule} SSL settings. */
export function pgClientConfig(database: { url: string; ssl: boolean }): ClientConfig {
  return {
    connectionString: database.url,
    ssl: database.ssl ? { rejectUnauthorized: false } : false,
  };
}
