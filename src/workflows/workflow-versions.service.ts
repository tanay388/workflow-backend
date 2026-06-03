import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { WorkflowGraph } from '../common/types/graph';
import { WorkflowVersion } from './entities/workflow-version.entity';

export interface CreateVersionResult {
  version: WorkflowVersion;
  versionNumber: number;
}

@Injectable()
export class WorkflowVersionsService {
  constructor(
    @InjectRepository(WorkflowVersion)
    private readonly versions: Repository<WorkflowVersion>,
    private readonly dataSource: DataSource,
  ) {}

  async createVersion(
    workflowId: string,
    graph: WorkflowGraph,
    userId: string,
    note?: string | null,
  ): Promise<CreateVersionResult> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(WorkflowVersion);
      const maxRow = await repo
        .createQueryBuilder('v')
        .select('MAX(v.version)', 'max')
        .where('v.workflow_id = :workflowId', { workflowId })
        .getRawOne<{ max: string | null }>();

      const nextVersion = (maxRow?.max ? parseInt(maxRow.max, 10) : 0) + 1;

      const version = repo.create({
        workflowId,
        version: nextVersion,
        graph,
        createdBy: userId,
        note: note ?? null,
      });
      const saved = await repo.save(version);

      await manager
        .createQueryBuilder()
        .update('workflows')
        .set({ currentVersionId: saved.id })
        .where('id = :workflowId', { workflowId })
        .execute();

      return { version: saved, versionNumber: nextVersion };
    });
  }

  async listVersions(workflowId: string): Promise<WorkflowVersion[]> {
    return this.versions.find({
      where: { workflowId },
      order: { version: 'DESC' },
    });
  }

  async getVersion(workflowId: string, versionNum: number): Promise<WorkflowVersion> {
    const row = await this.versions.findOne({
      where: { workflowId, version: versionNum },
    });
    if (!row) throw new NotFoundException(`Version ${versionNum} not found`);
    return row;
  }

  async restore(
    workflowId: string,
    versionNum: number,
    userId: string,
  ): Promise<CreateVersionResult> {
    const source = await this.getVersion(workflowId, versionNum);
    return this.createVersion(
      workflowId,
      source.graph,
      userId,
      `Restored from v${versionNum}`,
    );
  }
}
