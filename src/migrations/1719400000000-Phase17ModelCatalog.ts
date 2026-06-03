import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 17 — llm_provider enum, llm_models catalog, price history. */
export class Phase17ModelCatalog1719400000000 implements MigrationInterface {
  name = 'Phase17ModelCatalog1719400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE llm_provider AS ENUM (
          'openai', 'anthropic', 'deepseek', 'groq', 'together'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    const unknownCreds = (await queryRunner.query(`
      SELECT DISTINCT provider FROM llm_credentials
      WHERE provider NOT IN ('openai', 'anthropic', 'deepseek', 'groq', 'together')
    `)) as { provider: string }[];
    if (unknownCreds.length > 0) {
      throw new Error(
        `Cannot migrate llm_credentials.provider — unknown values: ${unknownCreds.map((r) => r.provider).join(', ')}`,
      );
    }

    const unknownUsage = (await queryRunner.query(`
      SELECT DISTINCT provider FROM token_usage
      WHERE provider NOT IN ('openai', 'anthropic', 'deepseek', 'groq', 'together')
    `)) as { provider: string }[];
    if (unknownUsage.length > 0) {
      throw new Error(
        `Cannot migrate token_usage.provider — unknown values: ${unknownUsage.map((r) => r.provider).join(', ')}`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE llm_credentials
      ALTER COLUMN provider TYPE llm_provider USING provider::llm_provider
    `);
    await queryRunner.query(`
      ALTER TABLE token_usage
      ALTER COLUMN provider TYPE llm_provider USING provider::llm_provider
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS llm_models (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider llm_provider NOT NULL,
        model_key varchar(255) NOT NULL,
        display_name varchar(255) NOT NULL,
        input_price_per_million_usd numeric(12,4) NOT NULL,
        output_price_per_million_usd numeric(12,4) NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_by uuid NULL,
        UNIQUE (provider, model_key)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_llm_models_provider ON llm_models (provider)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_llm_models_active ON llm_models (is_active) WHERE is_active = true`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS llm_model_price_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        model_id uuid NOT NULL REFERENCES llm_models(id) ON DELETE CASCADE,
        input_price_per_million_usd numeric(12,4) NOT NULL,
        output_price_per_million_usd numeric(12,4) NOT NULL,
        effective_from timestamptz NOT NULL DEFAULT now(),
        changed_by uuid NULL REFERENCES platform_admins(id) ON DELETE SET NULL,
        reason text NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_llm_model_price_history_model ON llm_model_price_history (model_id, effective_from DESC)`,
    );

    await queryRunner.query(`
      INSERT INTO llm_models (provider, model_key, display_name, input_price_per_million_usd, output_price_per_million_usd, is_active)
      VALUES
        ('openai', 'gpt-4o', 'GPT-4o', 2.5000, 10.0000, true),
        ('openai', 'gpt-4o-mini', 'GPT-4o Mini', 0.1500, 0.6000, true),
        ('anthropic', 'claude-sonnet-4-6', 'Claude Sonnet 4.6', 3.0000, 15.0000, true)
      ON CONFLICT (provider, model_key) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO llm_model_price_history (model_id, input_price_per_million_usd, output_price_per_million_usd, effective_from, reason)
      SELECT m.id, m.input_price_per_million_usd, m.output_price_per_million_usd, m.created_at, 'seed catalog'
      FROM llm_models m
      WHERE NOT EXISTS (
        SELECT 1 FROM llm_model_price_history h WHERE h.model_id = m.id
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS llm_model_price_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS llm_models`);
    await queryRunner.query(`
      ALTER TABLE token_usage
      ALTER COLUMN provider TYPE varchar(64) USING provider::text
    `);
    await queryRunner.query(`
      ALTER TABLE llm_credentials
      ALTER COLUMN provider TYPE varchar(64) USING provider::text
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS llm_provider`);
  }
}
