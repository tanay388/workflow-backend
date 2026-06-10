import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { createEmptyGraph } from '../common/types/graph';
import { normalizeGraphParameters } from '../common/utils/workflow-variables';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { GraphValidatorService } from '../variables/graph-validator.service';
import type { CreateWorkflowDto, ListWorkflowsQueryDto, UpdateWorkflowDto } from './dto/workflow.dto';
import { Workflow, WorkflowStatus } from './entities/workflow.entity';
import { WorkflowVersion } from './entities/workflow-version.entity';
import { WorkflowVersionsService } from './workflow-versions.service';

@Injectable()
export class WorkflowsService {
  constructor(
    @InjectRepository(Workflow)
    private readonly workflows: Repository<Workflow>,
    @InjectRepository(WorkflowVersion)
    private readonly versions: Repository<WorkflowVersion>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly versionService: WorkflowVersionsService,
    private readonly graphValidator: GraphValidatorService,
  ) {}

  private requireWorkspace(tenancy: Tenancy): string {
    if (!tenancy.workspaceId || !tenancy.orgId) {
      throw new ForbiddenException('Workspace context required');
    }
    return tenancy.workspaceId;
  }

  async create(tenancy: Tenancy, userId: string, dto: CreateWorkflowDto) {
    const workspaceId = this.requireWorkspace(tenancy);
    const workflow = this.workflows.create({
      workspaceId,
      orgId: tenancy.orgId!,
      name: dto.name,
      description: dto.description ?? null,
      status: WorkflowStatus.DRAFT,
      createdBy: userId,
      updatedBy: userId,
    });
    const saved = await this.workflows.save(workflow);

    const { version, versionNumber } = await this.versionService.createVersion(
      saved.id,
      createEmptyGraph(),
      userId,
      'Initial version',
    );

    const creatorNames = await this.loadCreatorNames([saved]);
    return this.toDetail(
      saved,
      version,
      versionNumber,
      creatorNames.get(saved.createdBy ?? '') ?? null,
    );
  }

  async list(tenancy: Tenancy, query: ListWorkflowsQueryDto) {
    const workspaceId = this.requireWorkspace(tenancy);
    const qb = this.workflows
      .createQueryBuilder('w')
      .where('w.workspace_id = :workspaceId', { workspaceId })
      .andWhere('w.org_id = :orgId', { orgId: tenancy.orgId })
      .andWhere('w.deleted_at IS NULL')
      .orderBy('w.updated_at', 'DESC');

    if (query.status) {
      qb.andWhere('w.status = :status', { status: query.status });
    }

    const rows = await qb.getMany();
    const creatorNames = await this.loadCreatorNames(rows);
    return rows.map((w) => this.toSummary(w, creatorNames.get(w.createdBy ?? '') ?? null));
  }

  async getById(tenancy: Tenancy, id: string) {
    const workflow = await this.findScoped(tenancy, id);
    const version = workflow.currentVersionId
      ? await this.versions.findOne({ where: { id: workflow.currentVersionId } })
      : null;
    const creatorNames = await this.loadCreatorNames([workflow]);

    return this.toDetail(
      workflow,
      version,
      version?.version ?? null,
      creatorNames.get(workflow.createdBy ?? '') ?? null,
    );
  }

  async update(tenancy: Tenancy, userId: string, id: string, dto: UpdateWorkflowDto) {
    const workflow = await this.findScoped(tenancy, id);
    let newVersionNumber: number | null = null;
    let newVersion: WorkflowVersion | null = null;

    if (dto.name !== undefined) workflow.name = dto.name;
    if (dto.description !== undefined) workflow.description = dto.description;
    if (dto.status !== undefined) workflow.status = dto.status;
    workflow.updatedBy = userId;

    if (dto.graph !== undefined) {
      // Canonicalize to the unified parameter model (lazy migration on save).
      const graph = normalizeGraphParameters(dto.graph);
      const validation = this.graphValidator.validate(graph);
      if (!validation.valid) {
        throw new BadRequestException({
          message: 'Graph validation failed',
          problems: validation.problems,
        });
      }
      const result = await this.versionService.createVersion(
        workflow.id,
        graph,
        userId,
        dto.note ?? null,
      );
      newVersion = result.version;
      newVersionNumber = result.versionNumber;
      workflow.currentVersionId = newVersion.id;
    }

    const saved = await this.workflows.save(workflow);

    const creatorNames = await this.loadCreatorNames([saved]);

    if (newVersion) {
      return this.toDetail(
        saved,
        newVersion,
        newVersionNumber,
        creatorNames.get(saved.createdBy ?? '') ?? null,
      );
    }

    const current = saved.currentVersionId
      ? await this.versions.findOne({ where: { id: saved.currentVersionId } })
      : null;
    return this.toDetail(
      saved,
      current,
      current?.version ?? null,
      creatorNames.get(saved.createdBy ?? '') ?? null,
    );
  }

  async softDelete(tenancy: Tenancy, userId: string, id: string) {
    const workflow = await this.findScoped(tenancy, id);
    workflow.deletedBy = userId;
    await this.workflows.softRemove(workflow);
    return { deleted: true };
  }

  private async findScoped(tenancy: Tenancy, id: string): Promise<Workflow> {
    this.requireWorkspace(tenancy);
    const workflow = await this.workflows.findOne({
      where: { id, orgId: tenancy.orgId!, workspaceId: tenancy.workspaceId!, deletedAt: IsNull() },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');
    return workflow;
  }

  private async loadCreatorNames(workflows: Workflow[]): Promise<Map<string, string>> {
    const userIds = [
      ...new Set(
        workflows.map((w) => w.createdBy).filter((id): id is string => Boolean(id)),
      ),
    ];
    if (userIds.length === 0) return new Map();

    const rows = await this.users.find({
      where: { id: In(userIds) },
      select: { id: true, name: true },
    });
    return new Map(rows.map((user) => [user.id, user.name]));
  }

  private toSummary(w: Workflow, createdByName: string | null = null) {
    return {
      id: w.id,
      name: w.name,
      description: w.description,
      status: w.status,
      currentVersionId: w.currentVersionId,
      createdBy: w.createdBy,
      createdByName,
      updatedAt: w.updatedAt,
      createdAt: w.createdAt,
    };
  }

  private toDetail(
    w: Workflow,
    version: WorkflowVersion | null,
    versionNumber: number | null,
    createdByName: string | null = null,
  ) {
    return {
      ...this.toSummary(w, createdByName),
      graph: version?.graph ?? null,
      version: versionNumber,
      versionNote: version?.note ?? null,
    };
  }
}
