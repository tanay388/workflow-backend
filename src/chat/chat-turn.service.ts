import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AgentMemoryService } from '../common/agent/agent-memory.service';
import { RUN_QUEUE, type RunQueue } from '../common/queue/run-queue.interface';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { validateRunInput } from '../common/utils/run-input';
import type { WorkflowGraph } from '../common/types/graph';
import { Workflow } from '../workflows/entities/workflow.entity';
import { WorkflowVersion } from '../workflows/entities/workflow-version.entity';
import { ByokValidationService } from '../engine/byok-validation.service';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { ConversationService, titleFromFirstMessage } from './conversation.service';

export interface SendTurnResult {
  runId: string;
  messageId: string;
}

@Injectable()
export class ChatTurnService {
  constructor(
    private readonly conversations: ConversationService,
    private readonly memory: AgentMemoryService,
    @Inject(RUN_QUEUE) private readonly queue: RunQueue,
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
    @InjectRepository(WorkflowVersion) private readonly versions: Repository<WorkflowVersion>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ConversationMessage)
    private readonly messages: Repository<ConversationMessage>,
    private readonly byok: ByokValidationService,
  ) {}

  async sendTurn(
    tenancy: Tenancy,
    conversationId: string,
    userId: string,
    content: string,
  ): Promise<SendTurnResult> {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Message content is required');

    const conv = await this.conversations.findBuilderTestScoped(tenancy, conversationId);
    if (conv.status !== 'open') {
      throw new BadRequestException('Conversation is closed');
    }

    const wf = await this.workflows.findOne({
      where: {
        id: conv.workflowId,
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        deletedAt: IsNull(),
      },
    });
    if (!wf?.currentVersionId) {
      throw new NotFoundException('Workflow not found or has no published version');
    }

    const version = await this.versions.findOne({ where: { id: wf.currentVersionId } });
    const graph = version?.graph as WorkflowGraph | undefined;
    if (graph) {
      const problems = await this.byok.validateGraph(tenancy.orgId!, graph);
      if (problems.length > 0) {
        throw new BadRequestException(problems[0]!.message);
      }
    }

    const priorHistory = await this.conversations.loadAgentHistory(conversationId);
    const agentHistory = this.memory.trimHistory(priorHistory);

    let userMsgId: string;
    let assistantMsgId: string;

    await this.dataSource.transaction(async (em) => {
      const msgRepo = em.getRepository(ConversationMessage);
      const convRepo = em.getRepository(Conversation);

      // Lock the conversation row first — Postgres forbids FOR UPDATE with aggregates.
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

      const userMsg = msgRepo.create({
        conversationId,
        orgId: tenancy.orgId!,
        role: 'user',
        content: trimmed,
        status: 'complete',
        seq: ++seq,
      });
      await msgRepo.save(userMsg);
      userMsgId = userMsg.id;

      const assistantMsg = msgRepo.create({
        conversationId,
        orgId: tenancy.orgId!,
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

    // Platform keys are injected after validation; _chat can never be caller-supplied.
    const runInput = {
      ...validateRunInput(graph, { message: trimmed, user_message: trimmed }, { mode: 'lenient' })
        .input,
      _chat: { assistantMessageId: assistantMsgId!, agentHistory },
    };

    const { runId } = await this.queue.enqueue({
      orgId: tenancy.orgId!,
      workspaceId: tenancy.workspaceId!,
      workflowId: conv.workflowId,
      workflowVersionId: wf.currentVersionId,
      triggerSource: 'chat',
      runBy: { type: 'user', id: userId, label: 'Chat' },
      input: runInput,
      conversationId,
      messageId: assistantMsgId!,
    });

    await this.messages.update(assistantMsgId!, { runId });

    return { runId, messageId: assistantMsgId! };
  }
}
