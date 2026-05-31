import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizePagination, paginate } from '../utils/pagination';
import { AuditActorType, AuditLog } from './audit-log.entity';

export interface RecordAuditInput {
  orgId: string;
  actorUserId?: string | null;
  actorType?: AuditActorType;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}

export interface AuditLogFilters {
  actorUserId?: string;
  action?: string;
  targetType?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async record(input: RecordAuditInput): Promise<AuditLog> {
    return this.repo.save(
      this.repo.create({
        orgId: input.orgId,
        actorUserId: input.actorUserId ?? null,
        actorType: input.actorType ?? AuditActorType.USER,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        meta: input.meta ?? null,
      }),
    );
  }

  async listForOrg(orgId: string, filters: AuditLogFilters = {}) {
    const { page, limit, offset } = normalizePagination(filters);
    const qb = this.repo
      .createQueryBuilder('log')
      .where('log.org_id = :orgId', { orgId })
      .orderBy('log.created_at', 'DESC');

    if (filters.actorUserId) {
      qb.andWhere('log.actor_user_id = :actorUserId', { actorUserId: filters.actorUserId });
    }
    if (filters.action) qb.andWhere('log.action = :action', { action: filters.action });
    if (filters.targetType) {
      qb.andWhere('log.target_type = :targetType', { targetType: filters.targetType });
    }
    if (filters.from) qb.andWhere('log.created_at >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('log.created_at <= :to', { to: filters.to });

    const [data, total] = await qb.skip(offset).take(limit).getManyAndCount();
    return paginate(data, total, page, limit);
  }
}
