import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * Standalone DataSource for the TypeORM CLI (migration:run / generate / revert).
 *
 * This is the ONE place process.env is read outside the config module: the CLI
 * runs outside Nest's DI container, so it cannot use AppConfigService. The
 * runtime app uses {@link DatabaseModule} (a single pool) instead of this.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is required to run database migrations');
}

export default new DataSource({
  type: 'postgres',
  url,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
