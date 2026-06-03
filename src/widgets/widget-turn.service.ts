import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AgentMemoryService } from '../common/agent/agent-memory.service';
import { RUN_QUEUE, type RunQueue } from '../common/queue/run-queue.interface';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { mergeRunInput } from '../common/utils/workflow-variables';
import type { WorkflowGraph } from '../common/types/graph';
import { Workflow } from '../workflows/entities/workflow.entity';
import { WorkflowVersion } from '../workflows/entities/workflow-version.entity';
import { ByokValidationService } from '../engine/byok-validation.service';
import { Conversation } from '../chat/entities/conversation.entity';
import { ConversationMessage } from '../chat/entities/conversation-message.entity';
import { ConversationService, titleFromFirstMessage } from '../chat/conversation.service';
import { FormSubmissionService } from '../forms/form-submission.service';
import type { ChatVisitor } from './entities/chat-visitor.entity';
import type { ChatWidget } from './entities/chat-widget.entity';
import { WidgetRateLimitService } from './widget-rate-limit.service';

export interface WidgetTurnResult {
  conversationId: string;
  runId: string;
  messageId: string;
}

@Injectable()
export class WidgetTurnService {
  constructor(
    private readonly conversations: ConversationService,
    private readonly memory: AgentMemoryService,
    private readonly rateLimit: WidgetRateLimitService,
    private readonly formSubmissions: FormSubmissionService,
    @Inject(RUN_QUEUE) private readonly queue: RunQueue,
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
    @InjectRepository(WorkflowVersion) private readonly versions: Repository<WorkflowVersion>,
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ConversationMessage)
    private readonly messages: Repository<ConversationMessage>,
    private readonly byok: ByokValidationService,
  ) {}

  tenancyFromWidget(widget: ChatWidget): Tenancy {
    return { orgId: widget.orgId, workspaceId: widget.workspaceId };
  }

  async findOpenConversation(
    widget: ChatWidget,
    visitor: ChatVisitor,
  ): Promise<Conversation | null> {
    return this.convRepo.findOne({
      where: {
        workflowId: widget.workflowId,
        visitorId: visitor.id,
        source: 'widget',
        status: 'open',
        orgId: widget.orgId,
        deletedAt: IsNull(),
      },
      order: { lastMessageAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async findVisitorConversation(
    widget: ChatWidget,
    visitor: ChatVisitor,
    conversationId: string,
  ): Promise<Conversation | null> {
    return this.convRepo.findOne({
      where: {
        id: conversationId,
        workflowId: widget.workflowId,
        visitorId: visitor.id,
        source: 'widget',
        orgId: widget.orgId,
        deletedAt: IsNull(),
      },
    });
  }

  async closeOpenConversations(widget: ChatWidget, visitor: ChatVisitor): Promise<void> {
    await this.convRepo.update(
      {
        workflowId: widget.workflowId,
        visitorId: visitor.id,
        source: 'widget',
        status: 'open',
        orgId: widget.orgId,
        deletedAt: IsNull(),
      },
      { status: 'closed' },
    );
  }

  async startConversation(
    widget: ChatWidget,
    visitor: ChatVisitor,
    options?: { forceNew?: boolean; formData?: Record<string, unknown> },
  ): Promise<Conversation> {
    if (options?.forceNew) {
      await this.closeOpenConversations(widget, visitor);
    } else {
      const existing = await this.findOpenConversation(widget, visitor);
      if (existing) return existing;
    }

    const row = this.convRepo.create({
      orgId: widget.orgId,
      workspaceId: widget.workspaceId,
      workflowId: widget.workflowId,
      source: 'widget',
      status: 'open',
      userId: null,
      visitorId: visitor.id,
      title: null,
      lastMessageAt: null,
    });
    const saved = await this.convRepo.save(row);

    return saved;
  }

  async sendTurn(
    widget: ChatWidget,
    visitor: ChatVisitor,
    conversationId: string,
    content: string,
    formInput?: Record<string, unknown>,
  ): Promise<WidgetTurnResult> {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Message content is required');

    const [messageCount, conv, wf, formFromDb, priorHistory] = await Promise.all([
      this.rateLimit.countTodayMessages(visitor.id),
      this.convRepo.findOne({
        where: {
          id: conversationId,
          orgId: widget.orgId,
          workflowId: widget.workflowId,
          visitorId: visitor.id,
          source: 'widget',
          deletedAt: IsNull(),
        },
      }),
      this.workflows.findOne({
        where: {
          id: widget.workflowId,
          orgId: widget.orgId,
          deletedAt: IsNull(),
        },
        relations: { currentVersion: true },
      }),
      formInput !== undefined
        ? Promise.resolve(formInput)
        : this.formSubmissions.getLatestForVisitorWorkflow(
            visitor.id,
            widget.workflowId,
            widget.id,
          ),
      this.conversations.loadAgentHistory(conversationId),
    ]);

    if (widget.rateLimitPerDay > 0 && messageCount >= widget.rateLimitPerDay) {
      throw new ForbiddenException('Daily message limit reached');
    }
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.status !== 'open') throw new BadRequestException('Conversation is closed');
    if (!wf?.currentVersionId) {
      throw new NotFoundException('Workflow not found or has no published version');
    }

    const graph = wf.currentVersion?.graph as WorkflowGraph | undefined;
    if (graph) {
      const problems = await this.byok.validateGraph(widget.orgId, graph);
      if (problems.length > 0) {
        throw new BadRequestException(problems[0]!.message);
      }
    }

    const agentHistory = this.memory.trimHistory(priorHistory);

    let assistantMsgId: string;

    const mergedFormSource = formFromDb ?? {};

    await this.dataSource.transaction(async (em) => {
      const msgRepo = em.getRepository(ConversationMessage);
      const convRepo = em.getRepository(Conversation);

      await convRepo
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :conversationId', { conversationId })
        .getOne();

      const maxRow = await msgRepo
        .createQueryBuilder('m')
        .select('COALESCE(MAX(m.seq), 0)', 'max')
        .where('m.conversation_id = :conversationId', { conversationId })
        .getRawOne<{ max: string }>();
      let seq = Number(maxRow?.max ?? 0);

      await msgRepo.save(
        msgRepo.create({
          conversationId,
          orgId: widget.orgId,
          role: 'user',
          content: trimmed,
          status: 'complete',
          seq: ++seq,
        }),
      );

      const assistantMsg = msgRepo.create({
        conversationId,
        orgId: widget.orgId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        seq: ++seq,
      });
      await msgRepo.save(assistantMsg);
      assistantMsgId = assistantMsg.id;

      await convRepo.update(conversationId, {
        lastMessageAt: new Date(),
        title: conv.title ?? titleFromFirstMessage(trimmed),
      });
    });

    const mergedForm = { ...mergedFormSource, ...(formInput ?? {}) };
    const runInput = graph
      ? mergeRunInput(graph, {
          message: trimmed,
          user_message: trimmed,
          form: mergedForm,
          _chat: { assistantMessageId: assistantMsgId!, agentHistory },
        })
      : {
          message: trimmed,
          form: mergedForm,
          _chat: { assistantMessageId: assistantMsgId!, agentHistory },
        };

    const { runId } = await this.queue.enqueue({
      orgId: widget.orgId,
      workspaceId: widget.workspaceId,
      workflowId: widget.workflowId,
      workflowVersionId: wf.currentVersionId!,
      triggerSource: 'widget',
      runBy: { type: 'visitor', id: visitor.id, label: visitor.displayName ?? 'Visitor' },
      input: runInput,
      conversationId,
      messageId: assistantMsgId!,
    });

    await this.messages.update(assistantMsgId!, { runId });

    return { conversationId, runId, messageId: assistantMsgId! };
  }
}
