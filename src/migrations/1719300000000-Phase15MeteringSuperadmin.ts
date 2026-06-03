import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 15 — usage_daily, usage_alerts, platform_admins. */
export class Phase15MeteringSuperadmin1719300000000 implements MigrationInterface {
  name = 'Phase15MeteringSuperadmin1719300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS usage_daily (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        day date NOT NULL,
        input_tokens bigint NOT NULL DEFAULT 0,
        output_tokens bigint NOT NULL DEFAULT 0,
        cost_usd numeric(12,6) NOT NULL DEFAULT 0,
        run_count int NOT NULL DEFAULT 0,
        UNIQUE (org_id, day)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_usage_daily_org_day ON usage_daily (org_id, day DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS usage_alerts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        day date NOT NULL,
        threshold_pct int NOT NULL,
        scope varchar(16) NOT NULL,
        channel varchar(32) NOT NULL DEFAULT 'email',
        sent_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (org_id, day, scope, threshold_pct)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_usage_alerts_org_day ON usage_alerts (org_id, day DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_admins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(320) NOT NULL UNIQUE,
        password_hash text NOT NULL,
        name varchar(255) NOT NULL,
        role varchar(32) NOT NULL DEFAULT 'superadmin',
        last_login_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS platform_admins`);
    await queryRunner.query(`DROP TABLE IF EXISTS usage_alerts`);
    await queryRunner.query(`DROP TABLE IF EXISTS usage_daily`);
  }
}
