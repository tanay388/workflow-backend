import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth.types';
import { CurrentTenancy } from '../common/decorators/current-tenancy.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MemberRole } from '../common/rbac/roles';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { ConversationService } from '../chat/conversation.service';
import { UpdateWidgetDto } from './dto/widget.dto';
import { WidgetInsightsService } from './widget-insights.service';
import { WidgetService } from './widget.service';

@ApiTags('widgets')
@Controller()
export class WidgetsController {
  constructor(
    private readonly widgets: WidgetService,
    private readonly insights: WidgetInsightsService,
    private readonly conversations: ConversationService,
  ) {}

  @Get('workflows/:workflowId/widget')
  getForWorkflow(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('workflowId') workflowId: string,
  ) {
    return this.widgets.getForWorkflow(tenancy, workflowId);
  }

  @Roles(MemberRole.EDITOR)
  @Post('workflows/:workflowId/widget')
  publish(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('workflowId') workflowId: string,
  ) {
    return this.widgets.publish(tenancy, workflowId, user.id);
  }

  @Roles(MemberRole.EDITOR)
  @Patch('widgets/:id')
  update(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWidgetDto,
  ) {
    return this.widgets.update(tenancy, id, user.id, dto);
  }

  @Roles(MemberRole.EDITOR)
  @Delete('widgets/:id')
  remove(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.widgets.softDelete(tenancy, id, user.id);
  }

  @Get('widgets/:id/embed-snippet')
  embedSnippet(@CurrentTenancy() tenancy: Tenancy, @Param('id') id: string) {
    return this.widgets.findScoped(tenancy, id).then((w) => ({
      snippet: this.widgets.embedSnippet(w.publicKey),
      publicKey: w.publicKey,
    }));
  }

  @Get('workflows/:workflowId/widget/visitors')
  listVisitors(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('workflowId') workflowId: string,
  ) {
    return this.insights.listVisitors(tenancy, workflowId);
  }

  @Get('workflows/:workflowId/widget/submissions')
  listSubmissions(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('workflowId') workflowId: string,
  ) {
    return this.insights.listSubmissions(tenancy, workflowId);
  }

  @Get('workflows/:workflowId/widget/conversations')
  listConversations(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('workflowId') workflowId: string,
  ) {
    return this.insights.listConversations(tenancy, workflowId);
  }

  @Get('workflows/:workflowId/widget/stats')
  stats(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('workflowId') workflowId: string,
  ) {
    return this.insights.getUsageStats(tenancy, workflowId);
  }

  @Get('workflows/:workflowId/widget/conversations/:conversationId')
  getConversation(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('conversationId') conversationId: string,
  ) {
    return this.conversations.getWidgetDetailForTenant(tenancy, conversationId);
  }
}
