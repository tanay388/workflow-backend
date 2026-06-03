import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth.types';
import { CurrentTenancy } from '../common/decorators/current-tenancy.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MemberRole } from '../common/rbac/roles';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { CreateScheduleDto, PatchScheduleDto } from './dto/schedule.dto';
import { SchedulesService } from './schedules.service';

@ApiTags('schedules')
@Controller('workflows/:workflowId/schedules')
export class WorkflowSchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  list(@CurrentTenancy() tenancy: Tenancy, @Param('workflowId') workflowId: string) {
    return this.schedules.list(tenancy, workflowId);
  }

  @Roles(MemberRole.EDITOR)
  @Post()
  create(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('workflowId') workflowId: string,
    @Body() dto: CreateScheduleDto,
  ) {
    return this.schedules.create(tenancy, workflowId, user.id, dto);
  }
}

@ApiTags('schedules')
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Roles(MemberRole.EDITOR)
  @Patch(':id')
  patch(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PatchScheduleDto,
  ) {
    return this.schedules.patch(tenancy, id, user.id, dto);
  }

  @Roles(MemberRole.EDITOR)
  @Delete(':id')
  remove(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.schedules.archive(tenancy, id, user.id);
  }
}
