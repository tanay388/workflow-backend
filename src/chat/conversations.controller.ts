import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth.types';
import { CurrentTenancy } from '../common/decorators/current-tenancy.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MemberRole } from '../common/rbac/roles';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { ChatTurnService } from './chat-turn.service';
import { ConversationService } from './conversation.service';
import { ChatTurnStreamService } from './chat-turn-stream.service';
import { ChatRunControlDto, CreateConversationDto, SendMessageDto } from './dto/chat.dto';

@ApiTags('conversations')
@Controller()
export class WorkflowConversationsController {
  constructor(private readonly conversations: ConversationService) {}

  @Get('workflows/:workflowId/conversations')
  list(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('workflowId') workflowId: string,
    @Query('source') source?: string,
  ) {
    if (source === 'widget') {
      return this.conversations.listWidgetForWorkflow(tenancy, workflowId);
    }
    return this.conversations.listForWorkflow(tenancy, workflowId);
  }

  @Roles(MemberRole.EDITOR)
  @Post('workflows/:workflowId/conversations')
  create(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('workflowId') workflowId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversations.create(tenancy, workflowId, user.id, 'builder_test', dto.title);
  }
}

@ApiTags('conversations')
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationService,
    private readonly turns: ChatTurnService,
    private readonly turnStream: ChatTurnStreamService,
  ) {}

  @Get(':id')
  get(@CurrentTenancy() tenancy: Tenancy, @Param('id') id: string) {
    return this.conversations.getDetail(tenancy, id);
  }

  /** SSE stream for a single chat turn (same NOTIFY channel as run trace). */
  @Get(':id/stream')
  async streamTurn(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') conversationId: string,
    @Query('runId') runId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!runId) {
      res.status(400).json({ message: 'runId query parameter is required' });
      return;
    }
    await this.turnStream.pipeTurnSse(tenancy, conversationId, runId, res, req);
  }

  @Roles(MemberRole.EDITOR)
  @Post(':id/messages')
  sendMessage(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.turns.sendTurn(tenancy, id, user.id, dto.content);
  }

  @Roles(MemberRole.EDITOR)
  @Post(':id/runs/:runId/control')
  controlRun(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') conversationId: string,
    @Param('runId') runId: string,
    @Body() dto: ChatRunControlDto,
  ) {
    return this.turnStream.handleControl(tenancy, conversationId, {
      type: dto.type,
      runId,
      answer: dto.answer,
    });
  }

  @Roles(MemberRole.EDITOR)
  @Delete(':id')
  remove(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.conversations.softDelete(tenancy, id, user.id);
  }
}
