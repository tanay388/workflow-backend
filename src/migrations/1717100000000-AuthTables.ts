import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 02 — users, refresh_tokens, email_otps (TRD §4.1 + OTP store). */
export class AuthTables1717100000000 implements MigrationInterface {
  name = 'AuthTables1717100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email             varchar(320) NOT NULL UNIQUE,
        password_hash     varchar(255) NOT NULL,
        name              varchar(255) NOT NULL,
        email_verified_at timestamptz NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        deleted_at        timestamptz NULL,
        created_by        uuid NULL,
        updated_by        uuid NULL,
        deleted_by        uuid NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash  varchar(64) NOT NULL,
        expires_at  timestamptz NOT NULL,
        revoked_at  timestamptz NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS email_otps (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash   varchar(64) NOT NULL,
        purpose     varchar(32) NOT NULL DEFAULT 'signup_verify',
        expires_at  timestamptz NOT NULL,
        consumed_at timestamptz NULL,
        attempts    int NOT NULL DEFAULT 0,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_email_otps_user ON email_otps (user_id, purpose)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS email_otps`);
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
