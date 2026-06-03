import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrgStatus, Organization } from '../iam/entities/organization.entity';
import { UsageDaily } from '../metering/entities/usage-daily.entity';

function monthStartUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

const LOW_CREDIT_THRESHOLD_USD = 1;

@Injectable()
export class AdminMetricsService {
  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(UsageDaily) private readonly daily: Repository<UsageDaily>,
  ) {}

  async getDashboardMetrics() {
    const monthStart = monthStartUtc();

    const orgCounts = await this.orgs
      .createQueryBuilder('o')
      .select('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN o.status = '${OrgStatus.ACTIVE}' THEN 1 ELSE 0 END)`, 'active')
      .addSelect(
        `SUM(CASE WHEN o.status = '${OrgStatus.SUSPENDED}' THEN 1 ELSE 0 END)`,
        'suspended',
      )
      .getRawOne<{ total: string; active: string; suspended: string }>();

    const mtdSpend = await this.daily
      .createQueryBuilder('d')
      .select('COALESCE(SUM(d.cost_usd), 0)', 'total')
      .where('d.day >= :monthStart', { monthStart })
      .getRawOne<{ total: string }>();

    const topTenants = await this.daily
      .createQueryBuilder('d')
      .innerJoin(Organization, 'o', 'o.id = d.org_id')
      .select('d.org_id', 'orgId')
      .addSelect('o.name', 'orgName')
      .addSelect('o.slug', 'orgSlug')
      .addSelect('COALESCE(SUM(d.cost_usd), 0)', 'mtdCostUsd')
      .where('d.day >= :monthStart', { monthStart })
      .groupBy('d.org_id')
      .addGroupBy('o.name')
      .addGroupBy('o.slug')
      .orderBy('mtdCostUsd', 'DESC')
      .limit(10)
      .getRawMany<{ orgId: string; orgName: string; orgSlug: string; mtdCostUsd: string }>();

    const lowCredit = await this.orgs
      .createQueryBuilder('o')
      .select('o.id', 'orgId')
      .addSelect('o.name', 'orgName')
      .addSelect('o.slug', 'orgSlug')
      .addSelect('o.credit_balance_usd', 'creditBalanceUsd')
      .where('o.status = :status', { status: OrgStatus.ACTIVE })
      .andWhere('o.credit_balance_usd <= :threshold', { threshold: LOW_CREDIT_THRESHOLD_USD })
      .orderBy('o.credit_balance_usd', 'ASC')
      .limit(20)
      .getRawMany<{
        orgId: string;
        orgName: string;
        orgSlug: string;
        creditBalanceUsd: string;
      }>();

    return {
      orgs: {
        total: Number(orgCounts?.total ?? 0),
        active: Number(orgCounts?.active ?? 0),
        suspended: Number(orgCounts?.suspended ?? 0),
      },
      mtdSpendUsd: Number(mtdSpend?.total ?? 0),
      topTenantsBySpend: topTenants.map((r) => ({
        orgId: r.orgId,
        orgName: r.orgName,
        orgSlug: r.orgSlug,
        mtdCostUsd: Number(r.mtdCostUsd),
      })),
      lowCreditTenants: lowCredit.map((r) => ({
        orgId: r.orgId,
        orgName: r.orgName,
        orgSlug: r.orgSlug,
        creditBalanceUsd: Number(r.creditBalanceUsd),
      })),
    };
  }
}
