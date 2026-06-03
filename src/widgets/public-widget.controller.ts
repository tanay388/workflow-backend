import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SkipTenancy } from '../common/decorators/skip-tenancy.decorator';
import { ChatTurnStreamService } from '../chat/chat-turn-stream.service';
import { ConversationService } from '../chat/conversation.service';
import { FormService } from '../forms/form.service';
import { FormSubmissionService } from '../forms/form-submission.service';
import {
  MintVisitorDto,
  SubmitFormDto,
  WidgetConversationDto,
  WidgetMessageDto,
} from './dto/widget.dto';
import { PublicWidgetService } from './public-widget.service';
import { VisitorService } from './visitor.service';
import { WidgetSessionService } from './widget-session.service';
import { WidgetTurnService } from './widget-turn.service';

@ApiTags('public-widget')
@Controller('public/widget')
@Public()
@SkipTenancy()
export class PublicWidgetController {
  constructor(
    private readonly publicWidget: PublicWidgetService,
    private readonly visitors: VisitorService,
    private readonly forms: FormService,
    private readonly submissions: FormSubmissionService,
    private readonly turns: WidgetTurnService,
    private readonly turnStream: ChatTurnStreamService,
    private readonly conversations: ConversationService,
    private readonly sessions: WidgetSessionService,
  ) {}

  @Get(':publicKey/config')
  async config(
    @Param('publicKey') publicKey: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resolved = await this.publicWidget.resolveFromRequest(publicKey, req);
    this.publicWidget.setCorsHeaders(res, resolved.origin);
    return this.publicWidget.getConfig(resolved);
  }

  @Post(':publicKey/visitor')
  async mintVisitor(
    @Param('publicKey') publicKey: string,
    @Body() dto: MintVisitorDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.publicWidget.assertPayloadSize(dto);
    const resolved = await this.publicWidget.resolveFromRequest(publicKey, req);
    this.publicWidget.setCorsHeaders(res, resolved.origin);
    await this.publicWidget.verifyRecaptchaIfNeeded(
      resolved.widget,
      dto.recaptchaToken,
      req.ip,
    );
    const { visitorToken, visitorId, visitor } = await this.visitors.mintOrContinue(
      resolved.widget,
      dto.visitorToken,
      {
        displayName: dto.displayName,
        email: dto.email,
        pageContext: dto.pageContext,
      },
    );
    const session = await this.sessions.getSession(resolved.widget, visitor);
    return { visitorToken, visitorId, ...session };
  }

  @Post(':publicKey/form')
  async submitForm(
    @Param('publicKey') publicKey: string,
    @Body() dto: SubmitFormDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.publicWidget.assertPayloadSize(dto);
    const resolved = await this.publicWidget.resolveFromRequest(publicKey, req);
    this.publicWidget.setCorsHeaders(res, resolved.origin);
    await this.publicWidget.verifyRecaptchaIfNeeded(
      resolved.widget,
      dto.recaptchaToken,
      req.ip,
    );
    const [visitor, form] = await Promise.all([
      this.visitors.findByToken(resolved.widget.id, dto.visitorToken),
      this.forms.findPublishedForWidget(
        resolved.widget.id,
        resolved.widget.workflowId,
      ),
    ]);
    if (!visitor) {
      return res.status(400).json({ message: 'Invalid visitor token' });
    }
    if (!form) {
      return res.status(400).json({ message: 'No published form for this widget' });
    }
    const submission = await this.submissions.create({
      form,
      visitorId: visitor.id,
      data: dto.data,
    });
    await this.visitors.applySubmissionProfile(visitor, submission.data, dto.pageContext);
    return { submissionId: submission.id, data: submission.data };
  }

  @Post(':publicKey/conversations')
  async startConversation(
    @Param('publicKey') publicKey: string,
    @Body() dto: WidgetConversationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.publicWidget.assertPayloadSize(dto);
    const resolved = await this.publicWidget.resolveFromRequest(publicKey, req);
    this.publicWidget.setCorsHeaders(res, resolved.origin);
    const visitor = await this.visitors.findByToken(resolved.widget.id, dto.visitorToken);
    if (!visitor) {
      return res.status(400).json({ message: 'Invalid visitor token' });
    }

    const conv = dto.conversationId
      ? await this.turns.findVisitorConversation(
          resolved.widget,
          visitor,
          dto.conversationId,
        )
      : await this.turns.startConversation(resolved.widget, visitor, {
          forceNew: dto.newSession === true,
        });
    if (!conv) {
      return res.status(400).json({ message: 'Conversation not found' });
    }

    if (!dto.message?.trim()) {
      return { conversationId: conv.id, messages: [] };
    }

    const result = await this.turns.sendTurn(
      resolved.widget,
      visitor,
      conv.id,
      dto.message,
    );
    return {
      conversationId: conv.id,
      runId: result.runId,
      messageId: result.messageId,
    };
  }

  @Post(':publicKey/conversations/:conversationId/messages')
  async sendMessage(
    @Param('publicKey') publicKey: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: WidgetMessageDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.publicWidget.assertPayloadSize(dto);
    const resolved = await this.publicWidget.resolveFromRequest(publicKey, req);
    this.publicWidget.setCorsHeaders(res, resolved.origin);
    const visitor = await this.visitors.findByToken(resolved.widget.id, dto.visitorToken);
    if (!visitor) {
      return res.status(400).json({ message: 'Invalid visitor token' });
    }
    const result = await this.turns.sendTurn(
      resolved.widget,
      visitor,
      conversationId,
      dto.content,
    );
    return result;
  }

  @Get(':publicKey/conversations/:conversationId')
  async getConversation(
    @Param('publicKey') publicKey: string,
    @Param('conversationId') conversationId: string,
    @Headers('x-visitor-token') visitorToken: string,
    @Query('visitorToken') visitorTokenQuery: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resolved = await this.publicWidget.resolveFromRequest(publicKey, req);
    this.publicWidget.setCorsHeaders(res, resolved.origin);
    const token = visitorToken || visitorTokenQuery;
    const visitor = await this.visitors.findByToken(resolved.widget.id, token);
    if (!visitor) {
      return res.status(400).json({ message: 'Invalid visitor token' });
    }
    const tenancy = this.turns.tenancyFromWidget(resolved.widget);
    const detail = await this.conversations.getWidgetDetail(
      tenancy,
      conversationId,
      visitor.id,
    );
    return detail;
  }

  @Get(':publicKey/conversations/:conversationId/stream')
  async stream(
    @Param('publicKey') publicKey: string,
    @Param('conversationId') conversationId: string,
    @Query('runId') runId: string,
    @Headers('x-visitor-token') visitorToken: string,
    @Query('visitorToken') visitorTokenQuery: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!runId) {
      res.status(400).json({ message: 'runId is required' });
      return;
    }
    const resolved = await this.publicWidget.resolveFromRequest(publicKey, req);
    this.publicWidget.setCorsHeaders(res, resolved.origin);
    const token = visitorToken || visitorTokenQuery;
    const visitor = await this.visitors.findByToken(resolved.widget.id, token);
    if (!visitor) {
      res.status(400).json({ message: 'Invalid visitor token' });
      return;
    }
    const tenancy = this.turns.tenancyFromWidget(resolved.widget);
    await this.conversations.assertWidgetConversation(
      tenancy,
      conversationId,
      visitor.id,
    );
    await this.turnStream.pipeTurnSse(tenancy, conversationId, runId, res, req);
  }
}
