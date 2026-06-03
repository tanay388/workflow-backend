import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth.types';
import { CurrentTenancy } from '../common/decorators/current-tenancy.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MemberRole } from '../common/rbac/roles';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { ApprovalService } from './approval.service';
import { ApprovalDecisionDto, ListApprovalsQueryDto } from './dto/approval.dto';

@ApiTags('approvals')
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalService) {}

  @Get()
  list(@CurrentTenancy() tenancy: Tenancy, @Query() query: ListApprovalsQueryDto) {
    return this.approvals.listInbox(tenancy, query.status);
  }

  @Roles(MemberRole.EDITOR)
  @Post(':id/decision')
  decide(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.approvals.decideById(tenancy, id, dto.decision, user.id);
  }
}
