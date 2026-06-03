import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminAuditService } from './admin-audit.service';
import { AuditLog } from '../common/audit/audit-log.entity';
import { AuditDisplayService } from '../common/audit/audit-display.service';

describe('AdminAuditService', () => {
  let service: AdminAuditService;

  const qb = {
    orderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(async () => [[{ id: 'log-1' }], 1]),
  };

  const repo = {
    createQueryBuilder: jest.fn(() => qb),
  };

  const display = {
    enrich: jest.fn(async (rows: AuditLog[]) =>
      rows.map((r) => ({ ...r, actorLabel: null, orgLabel: null, targetLabel: null })),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuditService,
        { provide: getRepositoryToken(AuditLog), useValue: repo },
        { provide: AuditDisplayService, useValue: display },
      ],
    }).compile();
    service = module.get(AdminAuditService);
  });

  it('applies actor, action, org, and date filters', async () => {
    await service.list({
      actorType: 'platform_admin' as never,
      action: 'credit',
      orgId: 'org-1',
      from: '2026-01-01',
      to: '2026-01-31',
      page: 1,
      limit: 10,
    });

    expect(qb.andWhere).toHaveBeenCalledWith('log.actor_type = :actorType', {
      actorType: 'platform_admin',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('log.action ILIKE :action', { action: '%credit%' });
    expect(qb.andWhere).toHaveBeenCalledWith('log.org_id = :orgId', { orgId: 'org-1' });
  });
});
