import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ApprovalService } from './approval.service';
import { PublicApprovalDecisionDto } from './dto/approval.dto';

@ApiTags('public-actions')
@Controller('a')
@Public()
export class PublicActionsController {
  constructor(private readonly approvals: ApprovalService) {}

  @Get(':actionToken')
  view(@Param('actionToken') actionToken: string) {
    return this.approvals.getPublicView(actionToken);
  }

  @Post(':actionToken')
  decide(
    @Param('actionToken') actionToken: string,
    @Body() dto: PublicApprovalDecisionDto,
  ) {
    return this.approvals.decideByToken(actionToken, dto.decision);
  }
}
