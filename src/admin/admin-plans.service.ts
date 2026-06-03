import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditActorType } from '../common/audit/audit-log.entity';
import { AuditService } from '../common/audit/audit.service';
import { Plan } from '../iam/entities/plan.entity';
import type { PlatformAdminUser } from './types/platform-admin.types';

@Injectable()
export class AdminPlansService {
  constructor(
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.plans.find({ order: { name: 'ASC' } });
  }

  async update(
    admin: PlatformAdminUser,
    id: string,
    input: {
      name?: string;
      baseMonthlyQuota?: string;
      defaultPricePerMillionUsd?: string;
      defaultConcurrency?: number;
      includedMonthlyCreditUsd?: string | null;
    },
  ) {
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');

    if (input.name !== undefined) plan.name = input.name;
    if (input.baseMonthlyQuota !== undefined) plan.baseMonthlyQuota = input.baseMonthlyQuota;
    if (input.defaultPricePerMillionUsd !== undefined) {
      plan.defaultPricePerMillionUsd = input.defaultPricePerMillionUsd;
    }
    if (input.defaultConcurrency !== undefined) plan.defaultConcurrency = input.defaultConcurrency;
    if (input.includedMonthlyCreditUsd !== undefined) {
      plan.includedMonthlyCreditUsd = input.includedMonthlyCreditUsd;
    }

    await this.plans.save(plan);

    await this.audit.record({
      orgId: null,
      actorType: AuditActorType.PLATFORM_ADMIN,
      action: 'platform.plan.updated',
      targetType: 'plan',
      targetId: plan.id,
      meta: { platformAdminId: admin.id, ...input },
    });

    return plan;
  }

  async deactivate(admin: PlatformAdminUser, id: string) {
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    plan.isActive = false;
    await this.plans.save(plan);

    await this.audit.record({
      orgId: null,
      actorType: AuditActorType.PLATFORM_ADMIN,
      action: 'platform.plan.deactivated',
      targetType: 'plan',
      targetId: plan.id,
      meta: { platformAdminId: admin.id },
    });

    return plan;
  }

  async create(
    admin: PlatformAdminUser,
    input: {
      name: string;
      baseMonthlyQuota: string;
      defaultPricePerMillionUsd: string;
      defaultConcurrency?: number;
      includedMonthlyCreditUsd?: string | null;
    },
  ) {
    const plan = await this.plans.save(
      this.plans.create({
        name: input.name,
        baseMonthlyQuota: input.baseMonthlyQuota,
        defaultPricePerMillionUsd: input.defaultPricePerMillionUsd,
        defaultConcurrency: input.defaultConcurrency ?? 5,
        includedMonthlyCreditUsd: input.includedMonthlyCreditUsd ?? null,
        isActive: true,
      }),
    );

    await this.audit.record({
      orgId: null,
      actorType: AuditActorType.PLATFORM_ADMIN,
      action: 'platform.plan.created',
      targetType: 'plan',
      targetId: plan.id,
      meta: { platformAdminId: admin.id, name: plan.name },
    });

    return plan;
  }

  async get(id: string) {
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }
}
