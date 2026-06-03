import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 10 — approval_requests + trigger_subscriptions for wait/event bindings. */
export class Phase10WaitApprovals1717700000000 implements MigrationInterface {
  name = 'Phase10WaitApprovals1717700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
        node_id text NOT NULL,
        title text NOT NULL,
        context jsonb NOT NULL DEFAULT '{}',
        status varchar(32) NOT NULL DEFAULT 'pending',
        decided_by uuid NULL,
        decided_at timestamptz NULL,
        action_token text NOT NULL UNIQUE,
        token_expires_at timestamptz NOT NULL,
        consumed_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_approval_requests_org_status ON approval_requests (org_id, status) WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_approval_requests_run ON approval_requests (run_id) WHERE deleted_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS trigger_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        kind varchar(64) NOT NULL DEFAULT 'composio_event',
        config jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_trigger_subscriptions_workflow ON trigger_subscriptions (workflow_id) WHERE deleted_at IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS trigger_subscriptions`);
    await queryRunner.query(`DROP TABLE IF EXISTS approval_requests`);
  }
}
