import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth.types';
import { CurrentTenancy } from '../common/decorators/current-tenancy.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MemberRole } from '../common/rbac/roles';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { ByokValidationService } from '../engine/byok-validation.service';
import { GraphValidatorService } from '../variables/graph-validator.service';
import { VariablesService } from '../variables/variables.service';
import {
  CreateWorkflowDto,
  ListWorkflowsQueryDto,
  UpdateWorkflowDto,
  ValidateGraphDto,
} from './dto/workflow.dto';
import { WorkflowVersionsService } from './workflow-versions.service';
import { WorkflowsService } from './workflows.service';

@ApiTags('workflows')
@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly workflows: WorkflowsService,
    private readonly versions: WorkflowVersionsService,
    private readonly graphValidator: GraphValidatorService,
    private readonly byok: ByokValidationService,
    private readonly variables: VariablesService,
  ) {}

  @Roles(MemberRole.EDITOR)
  @Post()
  create(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.workflows.create(tenancy, user.id, dto);
  }

  @Get()
  list(@CurrentTenancy() tenancy: Tenancy, @Query() query: ListWorkflowsQueryDto) {
    return this.workflows.list(tenancy, query);
  }

  @Get(':id/nodes/:nodeId/variables')
  async getNodeVariables(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
  ) {
    const detail = await this.workflows.getById(tenancy, id);
    if (!detail.graph) throw new NotFoundException('Workflow has no graph');
    return this.variables.getVariablesForNode(detail.graph, nodeId);
  }

  /** Resolve variables against an in-editor graph (includes unsaved nodes). */
  @Post(':id/nodes/:nodeId/variables')
  async resolveNodeVariables(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: ValidateGraphDto,
  ) {
    await this.workflows.getById(tenancy, id);
    return this.variables.getVariablesForNode(dto.graph, nodeId);
  }

  @Get(':id')
  get(@CurrentTenancy() tenancy: Tenancy, @Param('id') id: string) {
    return this.workflows.getById(tenancy, id);
  }

  @Roles(MemberRole.EDITOR)
  @Put(':id')
  update(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflows.update(tenancy, user.id, id, dto);
  }

  @Roles(MemberRole.EDITOR)
  @Delete(':id')
  remove(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.workflows.softDelete(tenancy, user.id, id);
  }

  @Post(':id/validate')
  async validate(@CurrentTenancy() tenancy: Tenancy, @Body() dto: ValidateGraphDto) {
    const result = this.graphValidator.validate(dto.graph);
    const byok = await this.byok.validateGraph(tenancy.orgId!, dto.graph);
    const problems = [...result.problems, ...byok];
    return {
      valid: problems.every((p) => p.severity !== 'error'),
      problems,
    };
  }

  @Get(':id/versions')
  listVersions(@CurrentTenancy() tenancy: Tenancy, @Param('id') id: string) {
    return this.listVersionsForWorkflow(tenancy, id);
  }

  @Get(':id/versions/:v')
  async getVersion(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') id: string,
    @Param('v', ParseIntPipe) version: number,
  ) {
    await this.workflows.getById(tenancy, id);
    const row = await this.versions.getVersion(id, version);
    return {
      id: row.id,
      workflowId: row.workflowId,
      version: row.version,
      graph: row.graph,
      note: row.note,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }

  @Roles(MemberRole.EDITOR)
  @Post(':id/versions/:v/restore')
  async restore(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('v', ParseIntPipe) version: number,
  ) {
    await this.workflows.getById(tenancy, id);
    const result = await this.versions.restore(id, version, user.id);
    return {
      version: result.versionNumber,
      versionId: result.version.id,
      graph: result.version.graph,
      note: result.version.note,
    };
  }

  private async listVersionsForWorkflow(tenancy: Tenancy, id: string) {
    await this.workflows.getById(tenancy, id);
    const rows = await this.versions.listVersions(id);
    return rows.map((v) => ({
      id: v.id,
      version: v.version,
      note: v.note,
      createdBy: v.createdBy,
      createdAt: v.createdAt,
    }));
  }
}
