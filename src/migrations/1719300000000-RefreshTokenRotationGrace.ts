import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rotation reuse-grace (TRD §10.1 hardening): a rotated-away refresh token
 * keeps an encrypted copy of its successor so a reload or parallel tab that
 * replays the old token within the grace window gets the same successor back
 * instead of being logged out.
 */
export class RefreshTokenRotationGrace1719300000000 implements MigrationInterface {
  name = 'RefreshTokenRotationGrace1719300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE refresh_tokens
        ADD COLUMN IF NOT EXISTS replaced_by_id uuid NULL,
        ADD COLUMN IF NOT EXISTS successor_cipher bytea NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE refresh_tokens
        DROP COLUMN IF EXISTS successor_cipher,
        DROP COLUMN IF EXISTS replaced_by_id
    `);
  }
}
