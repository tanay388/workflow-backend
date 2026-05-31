import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 03 — plans seed, organizations, workspaces, memberships, invitations. */
export class IamTables1717200000000 implements MigrationInterface {
  name = 'IamTables1717200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(128) NOT NULL,
        base_monthly_quota bigint NOT NULL,
        default_price_per_million_usd numeric(10,4) NOT NULL,
        default_concurrency int NOT NULL DEFAULT 5,
        is_active boolean NOT NULL DEFAULT true
      )
    `);

    await queryRunner.query(`
      INSERT INTO plans (id, name, base_monthly_quota, default_price_per_million_usd, default_concurrency)
      SELECT '00000000-0000-4000-8000-000000000001', 'Basic', 5000000, 10.00, 5
      WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'Basic')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(255) NOT NULL,
        slug varchar(128) NOT NULL UNIQUE,
        plan_id uuid NULL REFERENCES plans(id),
        concurrency_limit int NOT NULL DEFAULT 5,
        monthly_token_quota bigint NULL,
        price_per_million_usd numeric(10,4) NULL,
        daily_token_cap bigint NULL,
        alert_thresholds jsonb NULL,
        status varchar(32) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name varchar(255) NOT NULL,
        slug varchar(128) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL,
        UNIQUE (org_id, slug)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_workspaces_org ON workspaces (org_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NULL REFERENCES users(id) ON DELETE CASCADE,
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        role varchar(32) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'active',
        invited_email varchar(320) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL,
        UNIQUE (user_id, org_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships (org_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships (user_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email varchar(320) NOT NULL,
        role varchar(32) NOT NULL,
        token varchar(128) NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_invitations_org_email ON invitations (org_id, email)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS invitations`);
    await queryRunner.query(`DROP TABLE IF EXISTS memberships`);
    await queryRunner.query(`DROP TABLE IF EXISTS workspaces`);
    await queryRunner.query(`DROP TABLE IF EXISTS organizations`);
    await queryRunner.query(`DROP TABLE IF EXISTS plans`);
  }
}
