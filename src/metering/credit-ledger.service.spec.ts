import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../common/audit/audit.service';
import { Organization } from '../iam/entities/organization.entity';
import { CreditLedgerService } from './credit-ledger.service';
import { CreditTransaction, CreditTransactionType } from './entities/credit-transaction.entity';

describe('CreditLedgerService', () => {
  let service: CreditLedgerService;
  let orgBalance = '5.0000';

  const orgRepo = {
    findOne: jest.fn(async () => ({
      id: 'org-1',
      creditBalanceUsd: orgBalance,
    })),
    save: jest.fn(async (org: Organization) => {
      orgBalance = org.creditBalanceUsd;
      return org;
    }),
  };

  const ledgerRows: CreditTransaction[] = [];
  const ledgerRepo = {
    find: jest.fn(async () => ledgerRows),
    create: jest.fn((input) => input),
    save: jest.fn(async (row: CreditTransaction) => {
      const saved = { ...row, id: `tx-${ledgerRows.length + 1}` };
      ledgerRows.push(saved as CreditTransaction);
      return saved;
    }),
  };

  const dataSource = {
    transaction: jest.fn(async (fn: (em: unknown) => Promise<unknown>) => {
      const em = {
        getRepository: (entity: unknown) => {
          if (entity === Organization) return orgRepo;
          if (entity === CreditTransaction) return ledgerRepo;
          throw new Error('unknown entity');
        },
      };
      return fn(em);
    }),
  };

  beforeEach(async () => {
    orgBalance = '5.0000';
    ledgerRows.length = 0;
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditLedgerService,
        { provide: getRepositoryToken(CreditTransaction), useValue: ledgerRepo },
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(CreditLedgerService);
  });

  it('topup increases balance and appends ledger row', async () => {
    const result = await service.topup('org-1', 10, 'Manual top-up', 'admin-1');
    expect(result.balanceUsd).toBe(15);
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].type).toBe(CreditTransactionType.TOPUP);
    expect(ledgerRows[0].balanceAfter).toBe('15.0000');
  });

  it('adjust allows signed amounts', async () => {
    const result = await service.adjust('org-1', -2, 'Correction', 'admin-1');
    expect(result.balanceUsd).toBe(3);
    expect(ledgerRows[0].type).toBe(CreditTransactionType.ADJUSTMENT);
  });
});
