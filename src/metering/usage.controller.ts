import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
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
import {
  ByWorkflowQueryDto,
  UpdateOrgLimitsDto,
  UsageTimeseriesQueryDto,
} from './dto/usage.dto';
import { OrgLimitsService } from './org-limits.service';
import { UsageQueryService } from './usage-query.service';

@ApiTags('usage')
@Controller()
export class UsageController {
  constructor(
    private readonly usage: UsageQueryService,
    private readonly limits: OrgLimitsService,
  ) {}

  @Get('usage/summary')
  summary(@CurrentTenancy() tenancy: Tenancy) {
    return this.usage.summary(tenancy.orgId!);
  }

  @Get('usage/timeseries')
  timeseries(
    @CurrentTenancy() tenancy: Tenancy,
    @Query() query: UsageTimeseriesQueryDto,
  ) {
    return this.usage.timeseries(tenancy.orgId!, query.from, query.to);
  }

  @Get('usage/by-workflow')
  byWorkflow(
    @CurrentTenancy() tenancy: Tenancy,
    @Query() query: ByWorkflowQueryDto,
  ) {
    return this.usage.byWorkflow(tenancy.orgId!, query.limit ?? 10);
  }

  @Roles(MemberRole.ADMIN)
  @Put('orgs/:id/limits')
  async updateLimits(
    @CurrentUser() user: AuthUser,
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') orgId: string,
    @Body() dto: UpdateOrgLimitsDto,
  ) {
    if (tenancy.orgId !== orgId) {
      throw new ForbiddenException('Cannot update limits for another organization');
    }
    return this.limits.update(orgId, user.id, {
      dailyTokenCap: dto.dailyTokenCap,
      alertThresholds: dto.alertThresholds,
    });
  }
}
