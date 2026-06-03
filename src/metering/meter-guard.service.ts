import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrgStatus, Organization } from '../iam/entities/organization.entity';
import { UsageDaily } from './entities/usage-daily.entity';
import type { MeterRejectReason } from './metering.types';

export interface MeterGuardResult {
  allowed: boolean;
  reason?: MeterRejectReason;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

@Injectable()
export class MeterGuard {
  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(UsageDaily) private readonly daily: Repository<UsageDaily>,
  ) {}

  async checkClaimAllowed(orgId: string): Promise<MeterGuardResult> {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) return { allowed: false, reason: 'org_suspended' };

    if (org.status === OrgStatus.SUSPENDED) {
      return { allowed: false, reason: 'org_suspended' };
    }

    const today = todayUtc();
    const todayRow = await this.daily.findOne({ where: { orgId, day: today } });
    const todayTokens =
      Number(todayRow?.inputTokens ?? 0) + Number(todayRow?.outputTokens ?? 0);

    if (org.dailyTokenCap != null) {
      const cap = Number(org.dailyTokenCap);
      if (cap > 0 && todayTokens >= cap) {
        return { allowed: false, reason: 'daily_cap_exceeded' };
      }
    }

    if (org.monthlyTokenQuota != null) {
      const quota = Number(org.monthlyTokenQuota);
      if (quota > 0) {
        const monthStart = monthStartUtc();
        const rows = await this.daily
          .createQueryBuilder('d')
          .select('COALESCE(SUM(d.input_tokens + d.output_tokens), 0)', 'total')
          .where('d.org_id = :orgId', { orgId })
          .andWhere('d.day >= :monthStart', { monthStart })
          .getRawOne<{ total: string }>();

        const monthTokens = Number(rows?.total ?? 0);
        if (monthTokens >= quota) {
          return { allowed: false, reason: 'monthly_quota_exceeded' };
        }
      }
    }

    return { allowed: true };
  }
}
