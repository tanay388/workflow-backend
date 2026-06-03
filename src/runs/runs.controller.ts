import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth.types';
import { CurrentTenancy } from '../common/decorators/current-tenancy.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MemberRole } from '../common/rbac/roles';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { EnqueueRunBodyDto, ListRunsQueryDto } from './dto/run.dto';
import { RunQueryService } from './run-query.service';
import { RunStreamService } from './run-stream.service';
import { RunService } from './run.service';

@ApiTags('runs')
@Controller('runs')
export class RunsController {
  constructor(
    private readonly runs: RunService,
    private readonly query: RunQueryService,
    private readonly runStream: RunStreamService,
  ) {}

  @Get()
  list(@CurrentTenancy() tenancy: Tenancy, @Query() query: ListRunsQueryDto) {
    return this.query.list(tenancy, query);
  }

  @Get(':id/stream')
  async stream(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.runStream.pipeSse(tenancy, id, res, req);
  }

  @Get(':id')
  get(@CurrentTenancy() tenancy: Tenancy, @Param('id') id: string) {
    return this.query.detail(tenancy, id);
  }

  @Roles(MemberRole.EDITOR)
  @Post(':id/cancel')
  cancel(@CurrentTenancy() tenancy: Tenancy, @Param('id') id: string) {
    return this.runs.cancel(tenancy, id);
  }

  @Roles(MemberRole.EDITOR)
  @Post(':id/force-resume')
  forceResume(@CurrentTenancy() tenancy: Tenancy, @Param('id') id: string) {
    return this.runs.forceResume(tenancy, id);
  }

  @Roles(MemberRole.EDITOR)
  @Post(':id/rerun')
  rerun(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.runs.rerun(tenancy, id, user.id);
  }
}

@ApiTags('workflows')
@Controller('workflows')
export class WorkflowRunController {
  constructor(private readonly runs: RunService) {}

  @Roles(MemberRole.EDITOR)
  @Post(':id/run')
  enqueue(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: EnqueueRunBodyDto,
  ) {
    return this.runs.enqueue(tenancy, id, user.id, dto);
  }
}
