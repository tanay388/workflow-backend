import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../iam/entities/organization.entity';
import { TokenUsage } from './entities/token-usage.entity';
import { UsageDaily } from './entities/usage-daily.entity';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function daysInMonthUtc(): number {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
}

function dayOfMonthUtc(): number {
  return new Date().getUTCDate();
}

@Injectable()
export class UsageQueryService {
  constructor(
    @InjectRepository(UsageDaily) private readonly daily: Repository<UsageDaily>,
    @InjectRepository(TokenUsage) private readonly ledger: Repository<TokenUsage>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
  ) {}

  async summary(orgId: string) {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    const monthStart = monthStartUtc();
    const today = todayUtc();

    const mtd = await this.daily
      .createQueryBuilder('d')
      .select('COALESCE(SUM(d.input_tokens), 0)', 'inputTokens')
      .addSelect('COALESCE(SUM(d.output_tokens), 0)', 'outputTokens')
      .addSelect('COALESCE(SUM(d.cost_usd), 0)', 'costUsd')
      .addSelect('COALESCE(SUM(d.run_count), 0)', 'runCount')
      .where('d.org_id = :orgId', { orgId })
      .andWhere('d.day >= :monthStart', { monthStart })
      .getRawOne<{
        inputTokens: string;
        outputTokens: string;
        costUsd: string;
        runCount: string;
      }>();

    const todayRow = await this.daily.findOne({ where: { orgId, day: today } });
    const todayTokens =
      Number(todayRow?.inputTokens ?? 0) + Number(todayRow?.outputTokens ?? 0);
    const todayCost = Number(todayRow?.costUsd ?? 0);

    const mtdCost = Number(mtd?.costUsd ?? 0);
    const mtdTokens =
      Number(mtd?.inputTokens ?? 0) + Number(mtd?.outputTokens ?? 0);
    const elapsed = dayOfMonthUtc();
    const dim = daysInMonthUtc();
    const projectedMonthEndCost =
      elapsed > 0 ? (mtdCost / elapsed) * dim : mtdCost;

    const dailyCap = org?.dailyTokenCap ? Number(org.dailyTokenCap) : null;
    const monthlyQuota = org?.monthlyTokenQuota ? Number(org.monthlyTokenQuota) : null;

    const byokSplit = await this.byokSplit(orgId, monthStart);

    return {
      mtd: {
        inputTokens: Number(mtd?.inputTokens ?? 0),
        outputTokens: Number(mtd?.outputTokens ?? 0),
        totalTokens: mtdTokens,
        costUsd: mtdCost,
        runCount: Number(mtd?.runCount ?? 0),
      },
      today: {
        inputTokens: Number(todayRow?.inputTokens ?? 0),
        outputTokens: Number(todayRow?.outputTokens ?? 0),
        totalTokens: todayTokens,
        costUsd: todayCost,
      },
      limits: {
        dailyTokenCap: dailyCap,
        monthlyTokenQuota: monthlyQuota,
        pricePerMillionUsd: org?.pricePerMillionUsd
          ? Number(org.pricePerMillionUsd)
          : null,
      },
      dailyCap: dailyCap
        ? {
            used: todayTokens,
            cap: dailyCap,
            pct: dailyCap > 0 ? Math.min(100, (todayTokens / dailyCap) * 100) : 0,
          }
        : null,
      monthlyQuota: monthlyQuota
        ? {
            used: mtdTokens,
            quota: monthlyQuota,
            pct: monthlyQuota > 0 ? Math.min(100, (mtdTokens / monthlyQuota) * 100) : 0,
          }
        : null,
      projectedMonthEndCostUsd: projectedMonthEndCost,
      byokSplit,
    };
  }

  async timeseries(orgId: string, from?: string, to?: string) {
    const qb = this.daily
      .createQueryBuilder('d')
      .where('d.org_id = :orgId', { orgId })
      .orderBy('d.day', 'ASC');

    if (from) qb.andWhere('d.day >= :from', { from });
    if (to) qb.andWhere('d.day <= :to', { to });

    const rows = await qb.getMany();
    return rows.map((r) => ({
      day: r.day,
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      totalTokens: Number(r.inputTokens) + Number(r.outputTokens),
      costUsd: Number(r.costUsd),
      runCount: r.runCount,
    }));
  }

  async byWorkflow(orgId: string, limit = 10) {
    const monthStart = monthStartUtc();
    const rows = await this.ledger
      .createQueryBuilder('t')
      .select('t.workflow_id', 'workflowId')
      .addSelect('COALESCE(SUM(t.input_tokens + t.output_tokens), 0)', 'totalTokens')
      .addSelect('COALESCE(SUM(t.cost_usd), 0)', 'costUsd')
      .addSelect('COALESCE(SUM(CASE WHEN t.byok THEN t.input_tokens + t.output_tokens ELSE 0 END), 0)', 'byokTokens')
      .addSelect('COALESCE(SUM(CASE WHEN NOT t.byok THEN t.input_tokens + t.output_tokens ELSE 0 END), 0)', 'platformTokens')
      .where('t.org_id = :orgId', { orgId })
      .andWhere('t.created_at >= :monthStart', { monthStart: `${monthStart}T00:00:00.000Z` })
      .groupBy('t.workflow_id')
      .orderBy('costUsd', 'DESC')
      .limit(limit)
      .getRawMany<{
        workflowId: string;
        totalTokens: string;
        costUsd: string;
        byokTokens: string;
        platformTokens: string;
      }>();

    return rows.map((r) => ({
      workflowId: r.workflowId,
      totalTokens: Number(r.totalTokens),
      costUsd: Number(r.costUsd),
      byokTokens: Number(r.byokTokens),
      platformTokens: Number(r.platformTokens),
    }));
  }

  async adminOrgUsage(orgId: string) {
    const summary = await this.summary(orgId);
    const timeseries = await this.timeseries(orgId);
    const byWorkflow = await this.byWorkflow(orgId, 20);
    return { summary, timeseries, byWorkflow };
  }

  private async byokSplit(orgId: string, monthStart: string) {
    const row = await this.ledger
      .createQueryBuilder('t')
      .select('COALESCE(SUM(CASE WHEN t.byok THEN t.input_tokens + t.output_tokens ELSE 0 END), 0)', 'byokTokens')
      .addSelect('COALESCE(SUM(CASE WHEN NOT t.byok THEN t.input_tokens + t.output_tokens ELSE 0 END), 0)', 'platformTokens')
      .addSelect('COALESCE(SUM(t.cost_usd), 0)', 'costUsd')
      .where('t.org_id = :orgId', { orgId })
      .andWhere('t.created_at >= :monthStart', { monthStart: `${monthStart}T00:00:00.000Z` })
      .getRawOne<{ byokTokens: string; platformTokens: string; costUsd: string }>();

    const byok = Number(row?.byokTokens ?? 0);
    const platform = Number(row?.platformTokens ?? 0);
    const total = byok + platform;
    return {
      byokTokens: byok,
      platformTokens: platform,
      totalTokens: total,
      costUsd: Number(row?.costUsd ?? 0),
      byokPct: total > 0 ? (byok / total) * 100 : 0,
      platformPct: total > 0 ? (platform / total) * 100 : 0,
    };
  }
}
