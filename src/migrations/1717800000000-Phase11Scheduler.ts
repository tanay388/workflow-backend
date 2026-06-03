import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 11 — schedules table for timezone-aware workflow scheduling. */
export class Phase11Scheduler1717800000000 implements MigrationInterface {
  name = 'Phase11Scheduler1717800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        timezone text NOT NULL DEFAULT 'UTC',
        run_at_utc text NOT NULL,
        repeat varchar(32) NOT NULL DEFAULT 'daily',
        cron_expr text NULL,
        days_of_week int[] NULL,
        start_date date NOT NULL,
        ends_on date NULL,
        input jsonb NULL,
        status varchar(32) NOT NULL DEFAULT 'active',
        last_run_key text NULL,
        last_run_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules (status) WHERE status = 'active' AND deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_schedules_workflow ON schedules (workflow_id) WHERE deleted_at IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS schedules`);
  }
}
