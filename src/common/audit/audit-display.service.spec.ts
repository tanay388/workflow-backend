import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditActorType, AuditLog } from './audit-log.entity';
import { AuditDisplayService } from './audit-display.service';
import { Organization } from '../../iam/entities/organization.entity';
import { Workspace } from '../../iam/entities/workspace.entity';
import { User } from '../../auth/entities/user.entity';
import { Plan } from '../../iam/entities/plan.entity';
import { LlmModel } from '../../models/entities/llm-model.entity';
import { PlatformAdmin } from '../../admin/entities/platform-admin.entity';
import { Membership } from '../../iam/entities/membership.entity';
import { Invitation } from '../../iam/entities/invitation.entity';

describe('AuditDisplayService', () => {
  let service: AuditDisplayService;

  const orgRepo = { findBy: jest.fn(async () => [{ id: 'org-1', name: 'Acme Corp' }]) };
  const workspaceRepo = { findBy: jest.fn(async () => []) };
  const userRepo = {
    findBy: jest.fn(async () => [{ id: 'user-1', name: 'Jane Doe', email: 'jane@acme.com' }]),
  };
  const planRepo = { findBy: jest.fn(async () => []) };
  const modelRepo = { findBy: jest.fn(async () => []) };
  const adminRepo = {
    findBy: jest.fn(async () => [{ id: 'admin-1', name: 'Super Admin', email: 'admin@growy.io' }]),
  };
  const membershipRepo = { find: jest.fn(async () => []) };
  const invitationRepo = { findBy: jest.fn(async () => []) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditDisplayService,
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
        { provide: getRepositoryToken(Workspace), useValue: workspaceRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Plan), useValue: planRepo },
        { provide: getRepositoryToken(LlmModel), useValue: modelRepo },
        { provide: getRepositoryToken(PlatformAdmin), useValue: adminRepo },
        { provide: getRepositoryToken(Membership), useValue: membershipRepo },
        { provide: getRepositoryToken(Invitation), useValue: invitationRepo },
      ],
    }).compile();
    service = module.get(AuditDisplayService);
  });

  it('enriches org, actor, and target labels', async () => {
    const rows: AuditLog[] = [
      {
        id: 'log-1',
        orgId: 'org-1',
        actorUserId: 'user-1',
        actorType: AuditActorType.USER,
        action: 'member.role_changed',
        targetType: 'organization',
        targetId: 'org-1',
        meta: { from: 'editor', to: 'admin' },
        createdAt: new Date(),
      },
    ];

    const enriched = await service.enrich(rows);
    expect(enriched[0].orgLabel).toBe('Acme Corp');
    expect(enriched[0].actorLabel).toBe('Jane Doe');
    expect(enriched[0].targetLabel).toBe('Acme Corp');
  });

  it('resolves platform admin actor from meta', async () => {
    const rows: AuditLog[] = [
      {
        id: 'log-2',
        orgId: 'org-1',
        actorUserId: null,
        actorType: AuditActorType.PLATFORM_ADMIN,
        action: 'platform.org.suspended',
        targetType: 'organization',
        targetId: 'org-1',
        meta: { platformAdminId: 'admin-1', status: 'suspended' },
        createdAt: new Date(),
      },
    ];

    const enriched = await service.enrich(rows);
    expect(enriched[0].actorLabel).toBe('Super Admin');
  });

  it('returns System for system actor type', async () => {
    const rows: AuditLog[] = [
      {
        id: 'log-3',
        orgId: 'org-1',
        actorUserId: null,
        actorType: AuditActorType.SYSTEM,
        action: 'alert.sent',
        targetType: 'organization',
        targetId: 'org-1',
        meta: null,
        createdAt: new Date(),
      },
    ];

    const enriched = await service.enrich(rows);
    expect(enriched[0].actorLabel).toBe('System');
  });
});
