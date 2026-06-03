import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createEmptyGraph } from '../common/types/graph';
import { WorkflowVersion } from './entities/workflow-version.entity';
import { WorkflowVersionsService } from './workflow-versions.service';

describe('WorkflowVersionsService', () => {
  let service: WorkflowVersionsService;
  let savedVersions: WorkflowVersion[];
  let currentVersionId: string | null;

  const workflowId = 'wf-1';
  const userId = 'user-1';

  beforeEach(async () => {
    savedVersions = [];
    currentVersionId = null;
    let versionCounter = 0;

    const mockRepo = {
      create: (data: Partial<WorkflowVersion>) => ({ id: `ver-${++versionCounter}`, ...data }),
      save: async (entity: WorkflowVersion) => {
        savedVersions.push(entity as WorkflowVersion);
        return entity;
      },
      createQueryBuilder: () => ({
        select: () => ({
          where: () => ({
            getRawOne: async () => ({
              max: savedVersions.length ? String(savedVersions.length) : null,
            }),
          }),
        }),
      }),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const mockManager = {
      getRepository: () => mockRepo,
      createQueryBuilder: () => ({
        update: () => ({
          set: () => ({
            where: () => ({
              execute: async () => {
                currentVersionId = savedVersions.at(-1)?.id ?? null;
              },
            }),
          }),
        }),
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        WorkflowVersionsService,
        { provide: getRepositoryToken(WorkflowVersion), useValue: mockRepo },
        {
          provide: DataSource,
          useValue: {
            transaction: async (fn: (m: typeof mockManager) => Promise<unknown>) =>
              fn(mockManager),
          },
        },
      ],
    }).compile();

    service = module.get(WorkflowVersionsService);
  });

  it('createVersion increments version monotonically', async () => {
    const g = createEmptyGraph();
    const r1 = await service.createVersion(workflowId, g, userId);
    const r2 = await service.createVersion(workflowId, g, userId);
    expect(r1.versionNumber).toBe(1);
    expect(r2.versionNumber).toBe(2);
    expect(currentVersionId).toBe(r2.version.id);
  });

  it('restore creates new version without mutating source', async () => {
    const g = createEmptyGraph();
    g.nodes.push({
      id: 'n_agent',
      type: 'builtins.Agent',
      label: 'Agent',
      config: {},
      position: { x: 200, y: 0 },
    });
    await service.createVersion(workflowId, g, userId, 'v1');
    const v1Graph = JSON.parse(JSON.stringify(g));

    const modified = createEmptyGraph();
    await service.createVersion(workflowId, modified, userId, 'v2');

    const getVersionSpy = jest
      .spyOn(service, 'getVersion')
      .mockResolvedValue({
        id: 'ver-1',
        workflowId,
        version: 1,
        graph: v1Graph,
        createdBy: userId,
        note: 'v1',
        createdAt: new Date(),
      } as WorkflowVersion);

    const restored = await service.restore(workflowId, 1, userId);
    expect(restored.versionNumber).toBe(3);
    expect(restored.version.graph).toEqual(v1Graph);
    expect(restored.version.note).toBe('Restored from v1');
    getVersionSpy.mockRestore();
  });
});
