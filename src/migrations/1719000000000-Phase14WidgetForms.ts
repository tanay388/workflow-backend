import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 14 — chat_widgets, chat_visitors, forms, form_submissions. */
export class Phase14WidgetForms1719000000000 implements MigrationInterface {
  name = 'Phase14WidgetForms1719000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_widgets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        public_key text NOT NULL UNIQUE,
        signing_secret bytea NOT NULL,
        enabled bool NOT NULL DEFAULT true,
        allowed_domains text[] NOT NULL DEFAULT '{}',
        branding jsonb NOT NULL DEFAULT '{}',
        collect_contact bool NOT NULL DEFAULT false,
        rate_limit_per_day int NOT NULL DEFAULT 100,
        recaptcha_enabled bool NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_widgets_workflow
        ON chat_widgets (workflow_id)
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_visitors (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        widget_id uuid NOT NULL REFERENCES chat_widgets(id) ON DELETE CASCADE,
        visitor_token text NOT NULL UNIQUE,
        display_name text NULL,
        email text NULL,
        meta jsonb NULL,
        first_seen_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_visitors_widget
        ON chat_visitors (widget_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS forms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        name text NOT NULL,
        version int NOT NULL DEFAULT 1,
        status varchar(16) NOT NULL DEFAULT 'draft',
        schema jsonb NOT NULL DEFAULT '[]',
        bound_widget_id uuid NULL REFERENCES chat_widgets(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_forms_workflow
        ON forms (workflow_id, status)
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS form_submissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        form_id uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        conversation_id uuid NULL REFERENCES conversations(id) ON DELETE SET NULL,
        visitor_id uuid NULL REFERENCES chat_visitors(id) ON DELETE SET NULL,
        data jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_form_submissions_form
        ON form_submissions (form_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_visitor
        ON conversations (visitor_id, last_message_at DESC NULLS LAST)
        WHERE deleted_at IS NULL AND visitor_id IS NOT NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE conversations
          ADD CONSTRAINT fk_conversations_visitor
          FOREIGN KEY (visitor_id) REFERENCES chat_visitors(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE conversations DROP CONSTRAINT IF EXISTS fk_conversations_visitor
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_conversations_visitor`);
    await queryRunner.query(`DROP TABLE IF EXISTS form_submissions`);
    await queryRunner.query(`DROP TABLE IF EXISTS forms`);
    await queryRunner.query(`DROP TABLE IF EXISTS chat_visitors`);
    await queryRunner.query(`DROP TABLE IF EXISTS chat_widgets`);
  }
}
