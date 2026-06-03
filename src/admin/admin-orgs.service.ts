import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditActorType } from '../common/audit/audit-log.entity';
import { AuditService } from '../common/audit/audit.service';
import { OrgStatus, Organization } from '../iam/entities/organization.entity';
import { Plan } from '../iam/entities/plan.entity';
import { CreditLedgerService } from '../metering/credit-ledger.service';
import { UsageQueryService } from '../metering/usage-query.service';
import type { PlatformAdminUser } from './types/platform-admin.types';

@Injectable()
export class AdminOrgsService {
  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    private readonly usage: UsageQueryService,
    private readonly audit: AuditService,
    private readonly credits: CreditLedgerService,
  ) {}

  async list(search?: string) {
    const qb = this.orgs.createQueryBuilder('o');
    if (search?.trim()) {
      qb.where('o.name ILIKE :q OR o.slug ILIKE :q', { q: `%${search.trim()}%` });
    }
    qb.orderBy('o.created_at', 'DESC');
    const orgs = await qb.getMany();

    const enriched = await Promise.all(
      orgs.map(async (org) => {
        const summary = await this.usage.summary(org.id);
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          status: org.status,
          planId: org.planId,
          concurrencyLimit: org.concurrencyLimit,
          monthlyTokenQuota: org.monthlyTokenQuota,
          pricePerMillionUsd: org.pricePerMillionUsd,
          creditBalanceUsd: Number(org.creditBalanceUsd),
          mtdCostUsd: summary.mtd.costUsd,
          mtdTokens: summary.mtd.totalTokens,
          createdAt: org.createdAt,
        };
      }),
    );
    return enriched;
  }

  async getUsage(orgId: string) {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    return this.usage.adminOrgUsage(orgId);
  }

  async assignPlan(
    admin: PlatformAdminUser,
    orgId: string,
    input: {
      planId?: string | null;
      monthlyTokenQuota?: string | null;
      pricePerMillionUsd?: string | null;
      concurrencyLimit?: number;
    },
  ) {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    if (input.planId !== undefined) {
      if (input.planId) {
        const plan = await this.plans.findOne({ where: { id: input.planId } });
        if (!plan) throw new NotFoundException('Plan not found');
        org.planId = plan.id;
        if (input.monthlyTokenQuota === undefined) {
          org.monthlyTokenQuota = plan.baseMonthlyQuota;
        }
        if (input.pricePerMillionUsd === undefined) {
          org.pricePerMillionUsd = plan.defaultPricePerMillionUsd;
        }
        if (input.concurrencyLimit === undefined) {
          org.concurrencyLimit = plan.defaultConcurrency;
        }
      } else {
        org.planId = null;
      }
    }

    if (input.monthlyTokenQuota !== undefined) {
      org.monthlyTokenQuota = input.monthlyTokenQuota;
    }
    if (input.pricePerMillionUsd !== undefined) {
      org.pricePerMillionUsd = input.pricePerMillionUsd;
    }
    if (input.concurrencyLimit !== undefined) {
      org.concurrencyLimit = input.concurrencyLimit;
    }

    await this.orgs.save(org);

    await this.audit.record({
      orgId,
      actorType: AuditActorType.PLATFORM_ADMIN,
      action: 'platform.org.plan_assigned',
      targetType: 'organization',
      targetId: orgId,
      meta: { platformAdminId: admin.id, ...input },
    });

    return org;
  }

  async suspend(admin: PlatformAdminUser, orgId: string) {
    return this.setStatus(admin, orgId, OrgStatus.SUSPENDED, 'platform.org.suspended');
  }

  async reactivate(admin: PlatformAdminUser, orgId: string) {
    return this.setStatus(admin, orgId, OrgStatus.ACTIVE, 'platform.org.reactivated');
  }

  private async setStatus(
    admin: PlatformAdminUser,
    orgId: string,
    status: OrgStatus,
    action: string,
  ) {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    org.status = status;
    await this.orgs.save(org);

    await this.audit.record({
      orgId,
      actorType: AuditActorType.PLATFORM_ADMIN,
      action,
      targetType: 'organization',
      targetId: orgId,
      meta: { platformAdminId: admin.id, status },
    });

    return { id: org.id, status: org.status };
  }

  async getCredit(orgId: string) {
    const balance = await this.credits.getBalance(orgId);
    const ledger = await this.credits.getLedger(orgId, 100);
    return { balanceUsd: balance, ledger };
  }

  async applyCredit(
    admin: PlatformAdminUser,
    orgId: string,
    amountUsd: number,
    reason: string,
  ) {
    if (amountUsd > 0) {
      return this.credits.topup(orgId, amountUsd, reason, admin.id);
    }
    return this.credits.adjust(orgId, amountUsd, reason, admin.id);
  }
}
