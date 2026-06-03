import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Speed up public widget lookups (remote DB latency). */
export class WidgetPublicIndexes1719200000000 implements MigrationInterface {
  name = 'WidgetPublicIndexes1719200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_visitors_widget_token
        ON chat_visitors (widget_id, visitor_token)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_forms_published_widget
        ON forms (workflow_id, bound_widget_id, updated_at DESC)
        WHERE deleted_at IS NULL AND status = 'published'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_forms_published_widget`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_chat_visitors_widget_token`);
  }
}
