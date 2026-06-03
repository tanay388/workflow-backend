import { OrgStatus } from '../iam/entities/organization.entity';
import { MeterGuard } from './meter-guard.service';
import type { Organization } from '../iam/entities/organization.entity';
import type { UsageDaily } from './entities/usage-daily.entity';
import type { Repository } from 'typeorm';

function makeGuard(
  org: Partial<Organization> | null,
  todayRow: Partial<UsageDaily> | null,
  monthTotal = '0',
) {
  const orgs = {
    findOne: jest.fn().mockResolvedValue(org),
  } as unknown as Repository<Organization>;
  const daily = {
    findOne: jest.fn().mockResolvedValue(todayRow),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: monthTotal }),
    })),
  } as unknown as Repository<UsageDaily>;
  return new MeterGuard(orgs, daily);
}

describe('MeterGuard', () => {
  it('rejects suspended org before cap checks', async () => {
    const guard = makeGuard(
      { id: 'o1', status: OrgStatus.SUSPENDED, dailyTokenCap: '1', monthlyTokenQuota: '1' },
      null,
    );
    const result = await guard.checkClaimAllowed('o1');
    expect(result).toEqual({ allowed: false, reason: 'org_suspended' });
  });

  it('skips null daily cap', async () => {
    const guard = makeGuard(
      { id: 'o1', status: OrgStatus.ACTIVE, dailyTokenCap: null, monthlyTokenQuota: null },
      null,
    );
    expect(await guard.checkClaimAllowed('o1')).toEqual({ allowed: true });
  });

  it('rejects when daily cap reached (>=)', async () => {
    const guard = makeGuard(
      { id: 'o1', status: OrgStatus.ACTIVE, dailyTokenCap: '1000', monthlyTokenQuota: null },
      { inputTokens: '600', outputTokens: '400' },
    );
    expect(await guard.checkClaimAllowed('o1')).toEqual({
      allowed: false,
      reason: 'daily_cap_exceeded',
    });
  });

  it('rejects when monthly quota reached', async () => {
    const guard = makeGuard(
      { id: 'o1', status: OrgStatus.ACTIVE, dailyTokenCap: null, monthlyTokenQuota: '5000' },
      null,
      '5000',
    );
    expect(await guard.checkClaimAllowed('o1')).toEqual({
      allowed: false,
      reason: 'monthly_quota_exceeded',
    });
  });
});
