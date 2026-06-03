import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 13 — conversations, conversation_messages, workflow_runs FKs. */
export class Phase13Chat1718000000000 implements MigrationInterface {
  name = 'Phase13Chat1718000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        source varchar(32) NOT NULL DEFAULT 'builder_test',
        status varchar(32) NOT NULL DEFAULT 'open',
        user_id uuid NULL,
        visitor_id uuid NULL,
        title text NULL,
        last_message_at timestamptz NULL,
        memory jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_workspace_last_message
        ON conversations (workspace_id, last_message_at DESC NULLS LAST)
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_workflow
        ON conversations (workflow_id, created_at DESC)
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        role varchar(16) NOT NULL,
        content text NOT NULL DEFAULT '',
        status varchar(16) NOT NULL DEFAULT 'complete',
        run_id uuid NULL REFERENCES workflow_runs(id) ON DELETE SET NULL,
        input_tokens int NULL,
        output_tokens int NULL,
        model text NULL,
        seq int NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_messages_conv_seq
        ON conversation_messages (conversation_id, seq)
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE workflow_runs
          ADD CONSTRAINT fk_workflow_runs_conversation
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE workflow_runs
          ADD CONSTRAINT fk_workflow_runs_message
          FOREIGN KEY (message_id) REFERENCES conversation_messages(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workflow_runs DROP CONSTRAINT IF EXISTS fk_workflow_runs_message
    `);
    await queryRunner.query(`
      ALTER TABLE workflow_runs DROP CONSTRAINT IF EXISTS fk_workflow_runs_conversation
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS conversation_messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS conversations`);
  }
}
