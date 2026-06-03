import type { MigrationInterface, QueryRunner } from 'typeorm';
import { INTEGRATION_CATALOG_SEED } from '../connections/catalog.seed';

export class Phase09Connections1717600000000 implements MigrationInterface {
  name = 'Phase09Connections1717600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration_catalog (
        slug text PRIMARY KEY,
        label varchar(128) NOT NULL,
        logo_url text NOT NULL,
        supports_triggers boolean NOT NULL DEFAULT false,
        category varchar(64) NOT NULL DEFAULT 'integration',
        status varchar(16) NOT NULL DEFAULT 'beta'
      )
    `);

    for (const row of INTEGRATION_CATALOG_SEED) {
      await queryRunner.query(
        `
        INSERT INTO integration_catalog (slug, label, logo_url, supports_triggers, category, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (slug) DO UPDATE SET
          label = EXCLUDED.label,
          logo_url = EXCLUDED.logo_url,
          supports_triggers = EXCLUDED.supports_triggers,
          category = EXCLUDED.category,
          status = EXCLUDED.status
        `,
        [
          row.slug,
          row.label,
          row.logoUrl,
          row.supportsTriggers,
          row.category,
          row.status,
        ],
      );
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        toolkit text NOT NULL,
        name varchar(255) NOT NULL,
        is_default boolean NOT NULL DEFAULT false,
        composio_connection_id text NULL,
        composio_entity_id text NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'pending',
        scopes jsonb NULL,
        last_checked_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL,
        UNIQUE (workspace_id, toolkit, name)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_connections_workspace_toolkit ON connections (workspace_id, toolkit)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS connections`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration_catalog`);
  }
}
