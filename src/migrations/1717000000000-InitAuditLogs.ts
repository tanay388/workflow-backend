import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial migration — proves the migration pipeline and fixes the shape of
 * `audit_logs` early (TRD §4.1). Table only: the write path / AuditService is
 * owned by Phase 03, and `org_id` stays nullable until orgs exist (P03).
 */
export class InitAuditLogs1717000000000 implements MigrationInterface {
  name = 'InitAuditLogs1717000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // gen_random_uuid() lives in core on PG13+, but enable pgcrypto for safety.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id        uuid NULL,
        actor_user_id uuid NULL,
        actor_type    varchar(32) NOT NULL DEFAULT 'system'
                       CHECK (actor_type IN ('user', 'platform_admin', 'system')),
        action        varchar(128) NOT NULL,
        target_type   varchar(128) NULL,
        target_id     varchar(128) NULL,
        meta          jsonb NULL,
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs (org_id, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_logs_org_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
  }
}
