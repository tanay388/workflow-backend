import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppConfigService } from '../common/config/config.service';
import { costUsd, splitCostUsd } from '../common/utils/tokens';
import type { LlmProviderId, MeterContext } from '../common/llm/llm.types';
import { isLlmProvider } from '../common/llm/llm.types';
import { Organization } from '../iam/entities/organization.entity';
import { ModelCatalogCache } from '../models/model-catalog.cache';
import { RunStep } from '../runs/entities/run-step.entity';
import { WorkflowRun } from '../runs/entities/workflow-run.entity';
import { CreditLedgerService } from './credit-ledger.service';
import { CreditTransactionType } from './entities/credit-transaction.entity';
import { TokenUsage } from './entities/token-usage.entity';
import type { MeterRecordInput, MeterRecordLoopInput, MeteringService } from './metering.types';

export type { MeterRecordInput, MeteringService };

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class MeteringServiceImpl implements MeteringService {
  private readonly logger = new Logger(MeteringServiceImpl.name);

  constructor(
    @InjectRepository(TokenUsage) private readonly ledger: Repository<TokenUsage>,
    @InjectRepository(RunStep) private readonly steps: Repository<RunStep>,
    @InjectRepository(WorkflowRun) private readonly runs: Repository<WorkflowRun>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cfg: AppConfigService,
    private readonly catalog: ModelCatalogCache,
    private readonly credits: CreditLedgerService,
  ) {}

  async record(input: MeterRecordInput): Promise<void> {
    const cost = await this.resolveCost(input);
    await this.persistUsage({
      meter: input.meter,
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      byok: input.byok,
      cost,
      loopIndex: input.loopIndex,
      updateStepTotals: input.loopIndex == null,
    });
  }

  /** Record every agent-loop LLM call plus aggregated step/run totals. */
  async recordLoop(input: MeterRecordLoopInput): Promise<void> {
    if (input.calls.length === 0) return;

    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;

    for (let i = 0; i < input.calls.length; i++) {
      const call = input.calls[i]!;
      const cost = await this.resolveCost({
        meter: input.meter,
        provider: input.provider,
        model: input.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        byok: input.byok,
      });
      totalInput += call.inputTokens;
      totalOutput += call.outputTokens;
      totalCost += cost;

      await this.persistUsage({
        meter: input.meter,
        provider: input.provider,
        model: input.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        byok: input.byok,
        cost,
        loopIndex: i,
        updateStepTotals: false,
      });
    }

    await this.persistAggregatedTotals({
      meter: input.meter,
      model: input.model,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cost: totalCost,
    });

    if (!input.byok && totalCost > 0) {
      await this.debitCredits(input.meter, totalCost);
    }
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

  private async resolveCost(input: {
    meter: MeterContext;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    byok: boolean;
  }): Promise<number> {
    if (input.byok) return 0;

    const rate = await this.catalog.getRateWithFallback(input.provider, input.model);
    if (rate.found) {
      return splitCostUsd(
        input.inputTokens,
        input.outputTokens,
        Number(rate.inputPricePerMillionUsd),
        Number(rate.outputPricePerMillionUsd),
      );
    }

    const blended = await this.pricePerMillion(input.meter.orgId);
    return costUsd(input.inputTokens + input.outputTokens, blended);
  }

  private async persistUsage(params: {
    meter: MeterContext;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    byok: boolean;
    cost: number;
    loopIndex?: number;
    updateStepTotals: boolean;
  }): Promise<void> {
    const { meter, provider, model, inputTokens, outputTokens, byok, cost, loopIndex } = params;
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
          model: loopIndex != null ? `${model}#${loopIndex + 1}` : model,
          inputTokens,
          outputTokens,
          costUsd: costStr,
          byok,
        }),
      );

      if (params.updateStepTotals) {
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
      }
    });

    if (params.updateStepTotals && !byok && cost > 0) {
      await this.debitCredits(meter, cost);
    }
  }

  private async persistAggregatedTotals(params: {
    meter: MeterContext;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }): Promise<void> {
    const costStr = params.cost.toFixed(6);
    const day = todayUtc();

    await this.dataSource.transaction(async (em) => {
      await em.getRepository(RunStep).update(params.meter.stepId, {
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        model: params.model,
        costUsd: costStr,
      });

      await em
        .getRepository(WorkflowRun)
        .increment({ id: params.meter.runId }, 'totalInputTokens', params.inputTokens);
      await em
        .getRepository(WorkflowRun)
        .increment({ id: params.meter.runId }, 'totalOutputTokens', params.outputTokens);
      await em.query(
        `UPDATE workflow_runs SET total_cost_usd = total_cost_usd + $1 WHERE id = $2`,
        [costStr, params.meter.runId],
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
        [params.meter.orgId, day, params.inputTokens, params.outputTokens, costStr],
      );
    });
  }

  private async debitCredits(meter: MeterContext, cost: number): Promise<void> {
    try {
      await this.credits.applyCreditChange({
        orgId: meter.orgId,
        amountUsd: -Math.abs(cost),
        type: CreditTransactionType.DEBIT,
        reason: `LLM usage run ${meter.runId}`,
      });
    } catch (err) {
      this.logger.warn(
        `Credit debit failed for org ${meter.orgId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
