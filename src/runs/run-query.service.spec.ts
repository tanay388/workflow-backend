import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { RunQueryService } from './run-query.service';
import { RunStep } from './entities/run-step.entity';
import { WorkflowRun } from './entities/workflow-run.entity';

function mockQb(rows: WorkflowRun[] = [], total = rows.length) {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
    select: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ c: 3 }),
  };
  return qb;
}

describe('RunQueryService', () => {
  let svc: RunQueryService;
  let runsRepo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
  };
  let stepsRepo: { find: jest.Mock };
  let workflowsRepo: { findBy: jest.Mock };
  let usersRepo: { findBy: jest.Mock };

  const tenancy = { orgId: 'org-1', workspaceId: 'ws-1', userId: 'u-1' };

  beforeEach(async () => {
    runsRepo = {
      createQueryBuilder: jest.fn(() => mockQb()),
      findOne: jest.fn(),
    };
    stepsRepo = { find: jest.fn().mockResolvedValue([]) };
    workflowsRepo = {
      findBy: jest.fn().mockResolvedValue([{ id: 'wf-1', name: 'Lead nurture' }]),
    };
    usersRepo = { findBy: jest.fn().mockResolvedValue([]) };

    const module = await Test.createTestingModule({
      providers: [
        RunQueryService,
        { provide: getRepositoryToken(WorkflowRun), useValue: runsRepo },
        { provide: getRepositoryToken(RunStep), useValue: stepsRepo },
        { provide: getRepositoryToken(Workflow), useValue: workflowsRepo },
        { provide: getRepositoryToken(User), useValue: usersRepo },
      ],
    }).compile();

    svc = module.get(RunQueryService);
  });

  it('scopes list queries to org and workspace', async () => {
    const qb = mockQb([]);
    runsRepo.createQueryBuilder.mockReturnValue(qb);

    await svc.list(tenancy, { workflowId: 'wf-1', status: 'failed' });

    expect(qb.where).toHaveBeenCalledWith('r.org_id = :orgId', { orgId: 'org-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('r.workspace_id = :workspaceId', {
      workspaceId: 'ws-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('r.workflow_id = :workflowId', {
      workflowId: 'wf-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('r.status = :status', { status: 'failed' });
  });

  it('returns steps ordered by seq in detail', async () => {
    runsRepo.findOne.mockResolvedValue({
      id: 'run-1',
      orgId: 'org-1',
      workspaceId: 'ws-1',
      workflowId: 'wf-1',
      workflowVersionId: 'v-1',
      status: 'completed',
      triggerSource: 'manual',
      runBy: null,
      input: {},
      output: {},
      error: null,
      attempts: 0,
      maxAttempts: 3,
      totalInputTokens: '0',
      totalOutputTokens: '0',
      totalCostUsd: '0',
      startedAt: new Date(),
      finishedAt: new Date(),
      createdAt: new Date(),
    });
    stepsRepo.find.mockResolvedValue([
      { id: 's2', seq: 2, nodeId: 'b', nodeType: 't', nodeLabel: 'B', status: 'completed' },
      { id: 's1', seq: 1, nodeId: 'a', nodeType: 't', nodeLabel: 'A', status: 'completed' },
    ]);

    const detail = await svc.detail(tenancy, 'run-1');
    expect(stepsRepo.find).toHaveBeenCalledWith({
      where: { runId: 'run-1' },
      order: { seq: 'ASC' },
    });
    expect(detail.steps).toHaveLength(2);
    expect(detail.steps[0].seq).toBe(2);
    expect(detail.workflowName).toBe('Lead nurture');
  });

  it('resolves runByDisplay for user runs', async () => {
    runsRepo.findOne.mockResolvedValue({
      id: 'run-2',
      orgId: 'org-1',
      workspaceId: 'ws-1',
      workflowId: 'wf-1',
      workflowVersionId: 'v-1',
      status: 'completed',
      triggerSource: 'manual',
      runBy: { type: 'user', id: 'u-1', label: 'Manual run' },
      input: {},
      output: {},
      error: null,
      attempts: 0,
      maxAttempts: 3,
      totalInputTokens: '0',
      totalOutputTokens: '0',
      totalCostUsd: '0',
      startedAt: new Date(),
      finishedAt: new Date(),
      createdAt: new Date(),
    });
    usersRepo.findBy.mockResolvedValue([{ id: 'u-1', name: 'Jane Doe', email: 'jane@acme.com' }]);

    const detail = await svc.detail(tenancy, 'run-2');
    expect(detail.runByDisplay).toBe('Jane Doe');
  });
});
