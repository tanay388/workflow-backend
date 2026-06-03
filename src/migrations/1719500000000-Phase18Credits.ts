import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 18 — USD credit ledger + org balance cache. */
export class Phase18Credits1719500000000 implements MigrationInterface {
  name = 'Phase18Credits1719500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE credit_transaction_type AS ENUM (
          'signup_grant', 'topup', 'debit', 'adjustment'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS credit_balance_usd numeric(12,4) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE plans
      ADD COLUMN IF NOT EXISTS included_monthly_credit_usd numeric(12,4) NULL
    `);

    await queryRunner.query(`
      ALTER TABLE platform_admins
      ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        amount_usd numeric(12,4) NOT NULL,
        type credit_transaction_type NOT NULL,
        balance_after numeric(12,4) NOT NULL,
        reason text NULL,
        actor_type varchar(32) NULL,
        actor_id uuid NULL,
        run_id uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_credit_tx_org_created ON credit_transactions (org_id, created_at DESC)`,
    );

    await queryRunner.query(`
      INSERT INTO credit_transactions (org_id, amount_usd, type, balance_after, reason, actor_type)
      SELECT o.id, 5.0000, 'adjustment', 5.0000, 'Phase 18 backfill', 'system'
      FROM organizations o
      WHERE o.credit_balance_usd = 0
        AND NOT EXISTS (
          SELECT 1 FROM credit_transactions ct WHERE ct.org_id = o.id
        )
    `);
    await queryRunner.query(`
      UPDATE organizations o
      SET credit_balance_usd = 5.0000
      WHERE credit_balance_usd = 0
        AND EXISTS (
          SELECT 1 FROM credit_transactions ct
          WHERE ct.org_id = o.id AND ct.reason = 'Phase 18 backfill'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS credit_transactions`);
    await queryRunner.query(`ALTER TABLE platform_admins DROP COLUMN IF EXISTS is_active`);
    await queryRunner.query(`ALTER TABLE plans DROP COLUMN IF EXISTS included_monthly_credit_usd`);
    await queryRunner.query(`ALTER TABLE organizations DROP COLUMN IF EXISTS credit_balance_usd`);
    await queryRunner.query(`DROP TYPE IF EXISTS credit_transaction_type`);
  }
}
