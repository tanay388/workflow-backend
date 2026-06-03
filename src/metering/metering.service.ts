import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppConfigService } from '../common/config/config.service';
import { costUsd } from '../common/utils/tokens';
import type { LlmProviderId, MeterContext } from '../common/llm/llm.types';
import { isLlmProvider } from '../common/llm/llm.types';
import { Organization } from '../iam/entities/organization.entity';
import { RunStep } from '../runs/entities/run-step.entity';
import { WorkflowRun } from '../runs/entities/workflow-run.entity';
import { TokenUsage } from './entities/token-usage.entity';
import type { MeterRecordInput, MeteringService } from './metering.types';

export type { MeterRecordInput, MeteringService };

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class MeteringServiceImpl implements MeteringService {
  constructor(
    @InjectRepository(TokenUsage) private readonly ledger: Repository<TokenUsage>,
    @InjectRepository(RunStep) private readonly steps: Repository<RunStep>,
    @InjectRepository(WorkflowRun) private readonly runs: Repository<WorkflowRun>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cfg: AppConfigService,
  ) {}

  async record(input: MeterRecordInput): Promise<void> {
    const { meter, provider, model, inputTokens, outputTokens, byok } = input;
    const totalTokens = inputTokens + outputTokens;
    const price = await this.pricePerMillion(meter.orgId);
    const cost = costUsd(totalTokens, price);
    const costStr = cost.toFixed(6);
    const day = todayUtc();

    await this.dataSource.transaction(async (em) => {
      await em.getRepository(TokenUsage).save(
        em.getRepository(TokenUsage).create({
          orgId: meter.orgId,
          workspaceId: meter.workspaceId,
          workflowId: meter.workflowId,
          runId: meter.runId,
          stepId: meter.stepId,
          provider: isLlmProvider(provider) ? provider : ('openai' as LlmProviderId),
          model,
          inputTokens,
          outputTokens,
          costUsd: costStr,
          byok,
        }),
      );

      await em.getRepository(RunStep).update(meter.stepId, {
        inputTokens,
        outputTokens,
        model,
        costUsd: costStr,
      });

      await em
        .getRepository(WorkflowRun)
        .increment({ id: meter.runId }, 'totalInputTokens', inputTokens);
      await em
        .getRepository(WorkflowRun)
        .increment({ id: meter.runId }, 'totalOutputTokens', outputTokens);
      await em.query(
        `UPDATE workflow_runs SET total_cost_usd = total_cost_usd + $1 WHERE id = $2`,
        [costStr, meter.runId],
      );

      await em.query(
        `
        INSERT INTO usage_daily (org_id, day, input_tokens, output_tokens, cost_usd, run_count)
        VALUES ($1, $2::date, $3, $4, $5, 0)
        ON CONFLICT (org_id, day) DO UPDATE SET
          input_tokens = usage_daily.input_tokens + EXCLUDED.input_tokens,
          output_tokens = usage_daily.output_tokens + EXCLUDED.output_tokens,
          cost_usd = usage_daily.cost_usd + EXCLUDED.cost_usd
        `,
        [meter.orgId, day, inputTokens, outputTokens, costStr],
      );
    });
  }

  async rollupRunTotals(runId: string): Promise<void> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run) return;

    const day = (run.finishedAt ?? new Date()).toISOString().slice(0, 10);
    await this.dataSource.query(
      `
      INSERT INTO usage_daily (org_id, day, input_tokens, output_tokens, cost_usd, run_count)
      VALUES ($1, $2::date, 0, 0, 0, 1)
      ON CONFLICT (org_id, day) DO UPDATE SET
        run_count = usage_daily.run_count + 1
      `,
      [run.orgId, day],
    );
  }

  private async pricePerMillion(orgId: string): Promise<number> {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    const custom = org?.pricePerMillionUsd ? Number(org.pricePerMillionUsd) : NaN;
    if (!Number.isNaN(custom) && custom > 0) return custom;
    return this.cfg.defaultPricePerMillionUsd;
  }
}

/** @deprecated Use MeteringServiceImpl — kept for backward compat during migration. */
export const TokenUsageService = MeteringServiceImpl;
