import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 04 — workflows + immutable workflow_versions. */
export class WorkflowTables1717300000000 implements MigrationInterface {
  name = 'WorkflowTables1717300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name varchar(255) NOT NULL,
        description text NULL,
        status varchar(32) NOT NULL DEFAULT 'draft',
        current_version_id uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON workflows (workspace_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_workflows_org ON workflows (org_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workflow_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        version int NOT NULL,
        graph jsonb NOT NULL,
        created_by uuid NULL,
        note text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (workflow_id, version)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_workflow_versions_wf ON workflow_versions (workflow_id, version)`,
    );

    await queryRunner.query(`
      ALTER TABLE workflows
      ADD CONSTRAINT fk_workflows_current_version
      FOREIGN KEY (current_version_id) REFERENCES workflow_versions(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE workflows DROP CONSTRAINT IF EXISTS fk_workflows_current_version`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS workflow_versions`);
    await queryRunner.query(`DROP TABLE IF EXISTS workflows`);
  }
}
