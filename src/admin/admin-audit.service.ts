import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditDisplayService } from '../common/audit/audit-display.service';
import { AuditActorType, AuditLog } from '../common/audit/audit-log.entity';
import { normalizePagination, paginate } from '../common/utils/pagination';

export interface AdminAuditFilters {
  actorType?: AuditActorType;
  action?: string;
  orgId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AdminAuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
    private readonly display: AuditDisplayService,
  ) {}

  async list(filters: AdminAuditFilters = {}) {
    const { page, limit, offset } = normalizePagination(filters);
    const qb = this.repo.createQueryBuilder('log').orderBy('log.created_at', 'DESC');

    if (filters.actorType) {
      qb.andWhere('log.actor_type = :actorType', { actorType: filters.actorType });
    }
    if (filters.action?.trim()) {
      qb.andWhere('log.action ILIKE :action', { action: `%${filters.action.trim()}%` });
    }
    if (filters.orgId) {
      qb.andWhere('log.org_id = :orgId', { orgId: filters.orgId });
    }
    if (filters.from) {
      qb.andWhere('log.created_at >= :from', { from: new Date(filters.from) });
    }
    if (filters.to) {
      qb.andWhere('log.created_at <= :to', { to: new Date(filters.to) });
    }

    const [data, total] = await qb.skip(offset).take(limit).getManyAndCount();
    const enriched = await this.display.enrich(data);
    return paginate(enriched, total, page, limit);
  }
}
