import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SkipTenancy } from '../common/decorators/skip-tenancy.decorator';
import { AuditActorType } from '../common/audit/audit-log.entity';
import { Organization } from '../iam/entities/organization.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAdminsService } from './admin-admins.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminHealthService } from './admin-health.service';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminModelsService } from './admin-models.service';
import { AdminOrgsService } from './admin-orgs.service';
import { AdminPlansService } from './admin-plans.service';
import {
  CurrentPlatformAdmin,
  PlatformRoute,
  PlatformStepUp,
  PlatformWrite,
} from './decorators/platform-admin.decorator';
import {
  AdminAuditQueryDto,
  AdminOrgSearchDto,
  AssignOrgPlanDto,
  CreatePlanDto,
  CreatePlatformAdminDto,
  OrgCreditActionDto,
  PlatformLoginDto,
  UpdatePlanDto,
  UpdatePlatformAdminDto,
} from './dto/admin.dto';
import { StepUpConfirmDto, CreateModelDto, UpdateModelDto } from '../models/dto/model-catalog.dto';
import { PlatformAdminGuard } from './guards/platform-admin.guard';
import { PlatformStepUpService } from './platform-step-up.service';
import type { PlatformAdminUser } from './types/platform-admin.types';

@ApiTags('admin')
@Controller('admin')
@SkipTenancy()
@PlatformRoute()
@UseGuards(PlatformAdminGuard)
export class AdminController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly orgs: AdminOrgsService,
    private readonly plans: AdminPlansService,
    private readonly models: AdminModelsService,
    private readonly admins: AdminAdminsService,
    private readonly audit: AdminAuditService,
    private readonly metrics: AdminMetricsService,
    private readonly health: AdminHealthService,
    private readonly stepUpService: PlatformStepUpService,
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
  ) {}

  @Public()
  @Post('auth/login')
  login(@Body() dto: PlatformLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('auth/step-up')
  stepUp(
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
    @Body() dto: StepUpConfirmDto,
  ) {
    return this.stepUpService.stepUpResponse(admin.id, dto.password);
  }

  @Get('metrics')
  dashboardMetrics() {
    return this.metrics.getDashboardMetrics();
  }

  @Get('health')
  systemHealth() {
    return this.health.getHealth();
  }

  @Get('audit')
  listAudit(@Query() query: AdminAuditQueryDto) {
    return this.audit.list({
      actorType: query.actorType as AuditActorType | undefined,
      action: query.action,
      orgId: query.orgId,
      from: query.from,
      to: query.to,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('admins')
  listAdmins() {
    return this.admins.list();
  }

  @PlatformWrite()
  @PlatformStepUp()
  @Post('admins')
  createAdmin(
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
    @Body() dto: CreatePlatformAdminDto,
  ) {
    return this.admins.create(admin, dto);
  }

  @PlatformWrite()
  @PlatformStepUp()
  @Put('admins/:id')
  updateAdmin(
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlatformAdminDto,
  ) {
    return this.admins.update(admin, id, dto);
  }

  @PlatformWrite()
  @Post('admins/:id/deactivate')
  deactivateAdmin(
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
    @Param('id') id: string,
  ) {
    return this.admins.deactivate(admin, id);
  }

  @Get('models')
  listModels() {
    return this.models.list();
  }

  @PlatformWrite()
  @PlatformStepUp()
  @Post('models')
  createModel(
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
    @Body() dto: CreateModelDto,
  ) {
    return this.models.create(admin, dto);
  }

  @PlatformWrite()
  @PlatformStepUp()
  @Put('models/:id')
  updateModel(
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
    @Param('id') id: string,
    @Body() dto: UpdateModelDto,
  ) {
    return this.models.update(admin, id, dto);
  }

  @PlatformWrite()
  @Post('models/:id/activate')
  activateModel(@CurrentPlatformAdmin() admin: PlatformAdminUser, @Param('id') id: string) {
    return this.models.activate(admin, id);
  }

  @PlatformWrite()
  @Post('models/:id/deactivate')
  deactivateModel(@CurrentPlatformAdmin() admin: PlatformAdminUser, @Param('id') id: string) {
    return this.models.deactivate(admin, id);
  }

  @Get('models/:id/price-history')
  modelPriceHistory(@Param('id') id: string) {
    return this.models.priceHistory(id);
  }

  @Get('orgs')
  listOrgs(@Query() query: AdminOrgSearchDto) {
    return this.orgs.list(query.search);
  }

  @Get('orgs/:id/usage')
  orgUsage(@Param('id') id: string) {
    return this.orgs.getUsage(id);
  }

  @Get('orgs/:id/credit')
  orgCredit(@Param('id') id: string) {
    return this.orgs.getCredit(id);
  }

  @Post('orgs/:id/credit')
  applyOrgCredit(
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
    @Param('id') id: string,
    @Body() dto: OrgCreditActionDto,
  ) {
    return this.orgs.applyCredit(admin, id, dto.amountUsd, dto.reason);
  }

  @PlatformWrite()
  @Put('orgs/:id/plan')
  assignPlan(
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
    @Param('id') id: string,
    @Body() dto: AssignOrgPlanDto,
  ) {
    return this.orgs.assignPlan(admin, id, dto);
  }

  @PlatformWrite()
  @Post('orgs/:id/suspend')
  suspend(@CurrentPlatformAdmin() admin: PlatformAdminUser, @Param('id') id: string) {
    return this.orgs.suspend(admin, id);
  }

  @PlatformWrite()
  @Post('orgs/:id/reactivate')
  reactivate(@CurrentPlatformAdmin() admin: PlatformAdminUser, @Param('id') id: string) {
    return this.orgs.reactivate(admin, id);
  }

  @PlatformWrite()
  @Post('orgs/:id/impersonate')
  async impersonate(
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
    @Param('id') id: string,
  ) {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    return this.auth.impersonateOrg(admin, org);
  }

  @Get('plans')
  listPlans() {
    return this.plans.list();
  }

  @PlatformWrite()
  @Post('plans')
  createPlan(@CurrentPlatformAdmin() admin: PlatformAdminUser, @Body() dto: CreatePlanDto) {
    return this.plans.create(admin, dto);
  }

  @PlatformWrite()
  @Put('plans/:id')
  updatePlan(
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.plans.update(admin, id, dto);
  }

  @PlatformWrite()
  @Post('plans/:id/deactivate')
  deactivatePlan(@CurrentPlatformAdmin() admin: PlatformAdminUser, @Param('id') id: string) {
    return this.plans.deactivate(admin, id);
  }
}
