import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Widget origin policy — allow server CORS_ORIGINS or any origin. */
export class WidgetOriginFlags1719100000000 implements MigrationInterface {
  name = 'WidgetOriginFlags1719100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_widgets
        ADD COLUMN IF NOT EXISTS allow_cors_origins bool NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS allow_all_origins bool NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_widgets
        DROP COLUMN IF EXISTS allow_cors_origins,
        DROP COLUMN IF EXISTS allow_all_origins
    `);
  }
}
