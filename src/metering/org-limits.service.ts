import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../common/audit/audit.service';
import { Organization } from '../iam/entities/organization.entity';
import type { AlertThreshold } from './metering.types';

export interface UpdateOrgLimitsInput {
  dailyTokenCap?: string | null;
  alertThresholds?: AlertThreshold[] | null;
}

@Injectable()
export class OrgLimitsService {
  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    private readonly audit: AuditService,
  ) {}

  async update(orgId: string, userId: string, input: UpdateOrgLimitsInput) {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    if (input.dailyTokenCap !== undefined) {
      if (input.dailyTokenCap != null) {
        const cap = BigInt(input.dailyTokenCap);
        if (cap <= 0n) throw new BadRequestException('daily_token_cap must be positive');
        org.dailyTokenCap = cap.toString();
      } else {
        org.dailyTokenCap = null;
      }
    }

    if (input.alertThresholds !== undefined) {
      if (input.alertThresholds != null) {
        for (const t of input.alertThresholds) {
          if (t.pct < 1 || t.pct > 100) {
            throw new BadRequestException('alert threshold pct must be 1–100');
          }
        }
        org.alertThresholds = input.alertThresholds as unknown as Record<string, unknown>;
      } else {
        org.alertThresholds = null;
      }
    }

    await this.orgs.save(org);

    await this.audit.record({
      orgId,
      actorUserId: userId,
      action: 'org.limits.updated',
      targetType: 'organization',
      targetId: orgId,
      meta: {
        dailyTokenCap: org.dailyTokenCap,
        alertThresholds: org.alertThresholds,
      },
    });

    return {
      dailyTokenCap: org.dailyTokenCap,
      alertThresholds: org.alertThresholds,
    };
  }
}
