import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 08 — BYOK credentials, knowledge bases, token_usage ledger. */
export class Phase08LlmKnowledge1717500000000 implements MigrationInterface {
  name = 'Phase08LlmKnowledge1717500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS llm_credentials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        provider varchar(64) NOT NULL,
        encrypted_key bytea NOT NULL,
        key_fingerprint varchar(32) NOT NULL,
        label varchar(255) NULL,
        base_url text NULL,
        status varchar(32) NOT NULL DEFAULT 'unchecked',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL,
        UNIQUE (org_id, provider)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_llm_credentials_org ON llm_credentials (org_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS knowledge_bases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name varchar(255) NOT NULL,
        openai_vector_store_id text NOT NULL,
        byok boolean NOT NULL DEFAULT false,
        file_count int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_knowledge_bases_workspace ON knowledge_bases (workspace_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS knowledge_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kb_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        filename varchar(512) NOT NULL,
        storage_key text NULL,
        openai_file_id text NULL,
        status varchar(32) NOT NULL DEFAULT 'uploading',
        bytes bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_knowledge_files_kb ON knowledge_files (kb_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS token_usage (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
        step_id uuid NULL REFERENCES run_steps(id) ON DELETE SET NULL,
        provider varchar(64) NOT NULL,
        model text NOT NULL,
        input_tokens int NOT NULL DEFAULT 0,
        output_tokens int NOT NULL DEFAULT 0,
        cost_usd numeric(12,6) NOT NULL DEFAULT 0,
        byok boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_token_usage_run ON token_usage (run_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_token_usage_org_created ON token_usage (org_id, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS token_usage`);
    await queryRunner.query(`DROP TABLE IF EXISTS knowledge_files`);
    await queryRunner.query(`DROP TABLE IF EXISTS knowledge_bases`);
    await queryRunner.query(`DROP TABLE IF EXISTS llm_credentials`);
  }
}
