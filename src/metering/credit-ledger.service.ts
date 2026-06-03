import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditActorType } from '../common/audit/audit-log.entity';
import { AuditService } from '../common/audit/audit.service';
import { Organization } from '../iam/entities/organization.entity';
import {
  CreditTransaction,
  CreditTransactionType,
} from './entities/credit-transaction.entity';

export interface CreditLedgerRow {
  id: string;
  orgId: string;
  amountUsd: string;
  type: CreditTransactionType;
  balanceAfter: string;
  reason: string | null;
  actorType: string | null;
  actorId: string | null;
  runId: string | null;
  createdAt: Date;
}

@Injectable()
export class CreditLedgerService {
  constructor(
    @InjectRepository(CreditTransaction)
    private readonly ledger: Repository<CreditTransaction>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async getBalance(orgId: string): Promise<number> {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    return Number(org.creditBalanceUsd);
  }

  async getLedger(orgId: string, limit = 50): Promise<CreditLedgerRow[]> {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    const rows = await this.ledger.find({
      where: { orgId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
    return rows.map((r) => ({
      id: r.id,
      orgId: r.orgId,
      amountUsd: r.amountUsd,
      type: r.type,
      balanceAfter: r.balanceAfter,
      reason: r.reason,
      actorType: r.actorType,
      actorId: r.actorId,
      runId: r.runId,
      createdAt: r.createdAt,
    }));
  }

  async applyCreditChange(input: {
    orgId: string;
    amountUsd: number;
    type: CreditTransactionType;
    reason?: string;
    actorType?: AuditActorType | string;
    actorId?: string;
    auditAction?: string;
  }) {
    if (!Number.isFinite(input.amountUsd) || input.amountUsd === 0) {
      throw new BadRequestException('amount_usd must be a non-zero number');
    }

    return this.dataSource.transaction(async (em) => {
      const orgRepo = em.getRepository(Organization);
      const ledgerRepo = em.getRepository(CreditTransaction);

      const org = await orgRepo.findOne({
        where: { id: input.orgId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!org) throw new NotFoundException('Organization not found');

      const current = Number(org.creditBalanceUsd);
      const next = Math.round((current + input.amountUsd) * 10000) / 10000;
      org.creditBalanceUsd = next.toFixed(4);
      await orgRepo.save(org);

      const row = await ledgerRepo.save(
        ledgerRepo.create({
          orgId: input.orgId,
          amountUsd: input.amountUsd.toFixed(4),
          type: input.type,
          balanceAfter: org.creditBalanceUsd,
          reason: input.reason ?? null,
          actorType: input.actorType ?? null,
          actorId: input.actorId ?? null,
        }),
      );

      if (input.auditAction) {
        await this.audit.record({
          orgId: input.orgId,
          actorType:
            input.actorType === AuditActorType.PLATFORM_ADMIN
              ? AuditActorType.PLATFORM_ADMIN
              : AuditActorType.SYSTEM,
          action: input.auditAction,
          targetType: 'organization',
          targetId: input.orgId,
          meta: {
            amountUsd: input.amountUsd,
            balanceAfter: org.creditBalanceUsd,
            reason: input.reason,
            platformAdminId: input.actorId,
          },
        });
      }

      return { balanceUsd: next, transaction: row };
    });
  }

  async topup(orgId: string, amountUsd: number, reason: string, actorId: string) {
    if (amountUsd <= 0) throw new BadRequestException('Top-up amount must be positive');
    return this.applyCreditChange({
      orgId,
      amountUsd,
      type: CreditTransactionType.TOPUP,
      reason,
      actorType: AuditActorType.PLATFORM_ADMIN,
      actorId,
      auditAction: 'platform.credit.topup',
    });
  }

  async adjust(orgId: string, amountUsd: number, reason: string, actorId: string) {
    return this.applyCreditChange({
      orgId,
      amountUsd,
      type: CreditTransactionType.ADJUSTMENT,
      reason,
      actorType: AuditActorType.PLATFORM_ADMIN,
      actorId,
      auditAction: 'platform.credit.adjustment',
    });
  }
}
