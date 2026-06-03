import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 12 — trigger_subscriptions (workflow), inbound_webhooks, workflow_triggers, webhook_deliveries. */
export class Phase12Triggers1717900000000 implements MigrationInterface {
  name = 'Phase12Triggers1717900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE trigger_subscriptions
        ADD COLUMN IF NOT EXISTS connected_account_id uuid NULL REFERENCES connections(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS toolkit text NULL,
        ADD COLUMN IF NOT EXISTS event_slug text NULL,
        ADD COLUMN IF NOT EXISTS external_id text NULL,
        ADD COLUMN IF NOT EXISTS status varchar(32) NULL,
        ADD COLUMN IF NOT EXISTS user_query text NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_trigger_subscriptions_external
        ON trigger_subscriptions (external_id)
        WHERE deleted_at IS NULL AND external_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inbound_webhooks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        path_token text NOT NULL UNIQUE,
        signing_secret text NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_webhooks_workflow
        ON inbound_webhooks (workflow_id)
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workflow_triggers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        source_workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        target_workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        event varchar(32) NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_triggers_source
        ON workflow_triggers (source_workflow_id, event)
        WHERE deleted_at IS NULL AND is_active = true
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        idempotency_key text NOT NULL,
        source text NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now(),
        run_id uuid NULL REFERENCES workflow_runs(id) ON DELETE SET NULL,
        UNIQUE (org_id, idempotency_key)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS webhook_deliveries`);
    await queryRunner.query(`DROP TABLE IF EXISTS workflow_triggers`);
    await queryRunner.query(`DROP TABLE IF EXISTS inbound_webhooks`);
    await queryRunner.query(`
      ALTER TABLE trigger_subscriptions
        DROP COLUMN IF EXISTS user_query,
        DROP COLUMN IF EXISTS status,
        DROP COLUMN IF EXISTS external_id,
        DROP COLUMN IF EXISTS event_slug,
        DROP COLUMN IF EXISTS toolkit,
        DROP COLUMN IF EXISTS connected_account_id
    `);
  }
}
