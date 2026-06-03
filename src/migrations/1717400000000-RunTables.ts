import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 06 — workflow_runs queue + run_steps trace. */
export class RunTables1717400000000 implements MigrationInterface {
  name = 'RunTables1717400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE RESTRICT,
        status varchar(32) NOT NULL DEFAULT 'queued',
        trigger_source varchar(32) NOT NULL DEFAULT 'manual',
        run_by jsonb NULL,
        conversation_id uuid NULL,
        message_id uuid NULL,
        trigger_metadata jsonb NULL,
        input jsonb NOT NULL DEFAULT '{}',
        output jsonb NULL,
        resume_state jsonb NULL,
        last_completed_node_id text NULL,
        resume_at timestamptz NULL,
        wait_mode varchar(32) NULL,
        attempts int NOT NULL DEFAULT 0,
        max_attempts int NOT NULL DEFAULT 3,
        locked_by text NULL,
        locked_at timestamptz NULL,
        error text NULL,
        total_input_tokens bigint NOT NULL DEFAULT 0,
        total_output_tokens bigint NOT NULL DEFAULT 0,
        total_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
        started_at timestamptz NULL,
        finished_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_workflow_runs_status_org_created ON workflow_runs (status, org_id, created_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_workflow_runs_queued ON workflow_runs (created_at) WHERE status = 'queued'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_workflow_runs_paused_resume ON workflow_runs (resume_at) WHERE status = 'paused' AND resume_at IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_created ON workflow_runs (workflow_id, created_at DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS run_steps (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        node_id text NOT NULL,
        node_type text NOT NULL,
        node_label text NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'running',
        input jsonb NULL,
        output jsonb NULL,
        error text NULL,
        input_tokens int NOT NULL DEFAULT 0,
        output_tokens int NOT NULL DEFAULT 0,
        model text NULL,
        cost_usd numeric(12,6) NOT NULL DEFAULT 0,
        started_at timestamptz NOT NULL DEFAULT now(),
        ended_at timestamptz NULL,
        seq int NOT NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_run_steps_run_seq ON run_steps (run_id, seq)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS run_steps`);
    await queryRunner.query(`DROP TABLE IF EXISTS workflow_runs`);
  }
}
