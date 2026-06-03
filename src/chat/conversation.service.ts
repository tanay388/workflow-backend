import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { AgentInputItem } from '@openai/agents';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { Workflow } from '../workflows/entities/workflow.entity';
import { Conversation, type ConversationSource } from './entities/conversation.entity';
import { ConversationMessage, type MessageRole } from './entities/conversation-message.entity';

export interface ConversationListItem {
  id: string;
  workflowId: string;
  title: string | null;
  status: string;
  source: string;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  role: string;
  content: string;
  status: string;
  seq: number;
  runId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string | null;
  createdAt: string;
}

/** Internal editor test chats only — separate from widget/api conversations. */
export const BUILDER_TEST_SOURCE: ConversationSource = 'builder_test';

export function titleFromFirstMessage(content: string): string {
  const line = (content.trim().split(/\r?\n/)[0] ?? '').replace(/\s+/g, ' ').trim();
  if (!line) return 'New chat';
  if (line.length <= 80) return line;
  return `${line.slice(0, 77)}...`;
}

export interface ConversationDetailDto {
  id: string;
  workflowId: string;
  title: string | null;
  status: string;
  source: string;
  lastMessageAt: string | null;
  messages: MessageDto[];
}

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private readonly messages: Repository<ConversationMessage>,
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
  ) {}

  async listForWorkflow(tenancy: Tenancy, workflowId: string): Promise<ConversationListItem[]> {
    await this.assertWorkflow(tenancy, workflowId);
    const rows = await this.conversations.find({
      where: {
        workflowId,
        source: BUILDER_TEST_SOURCE,
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        deletedAt: IsNull(),
      },
      order: { lastMessageAt: 'DESC', createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((r) => this.toListItem(r));
  }

  async create(
    tenancy: Tenancy,
    workflowId: string,
    userId: string,
    source: ConversationSource = 'builder_test',
    title?: string | null,
  ): Promise<ConversationDetailDto> {
    await this.assertWorkflow(tenancy, workflowId);
    const row = this.conversations.create({
      orgId: tenancy.orgId!,
      workspaceId: tenancy.workspaceId!,
      workflowId,
      source,
      status: 'open',
      userId,
      title: title?.trim() || null,
      lastMessageAt: null,
      createdBy: userId,
    });
    const saved = await this.conversations.save(row);
    return {
      id: saved.id,
      workflowId: saved.workflowId,
      title: saved.title,
      status: saved.status,
      source: saved.source,
      lastMessageAt: null,
      messages: [],
    };
  }

  async getWidgetDetailForTenant(
    tenancy: Tenancy,
    conversationId: string,
  ): Promise<ConversationDetailDto> {
    const conv = await this.conversations.findOne({
      where: {
        id: conversationId,
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        source: 'widget',
        deletedAt: IsNull(),
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    const msgs = await this.messages.find({
      where: { conversationId: conv.id },
      order: { seq: 'ASC' },
    });
    return {
      id: conv.id,
      workflowId: conv.workflowId,
      title: conv.title,
      status: conv.status,
      source: conv.source,
      lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
      messages: msgs.map((m) => this.toMessageDto(m)),
    };
  }

  async getDetail(tenancy: Tenancy, conversationId: string): Promise<ConversationDetailDto> {
    const conv = await this.findBuilderTestScoped(tenancy, conversationId);
    const msgs = await this.messages.find({
      where: { conversationId: conv.id },
      order: { seq: 'ASC' },
    });
    return {
      id: conv.id,
      workflowId: conv.workflowId,
      title: conv.title,
      status: conv.status,
      source: conv.source,
      lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
      messages: msgs.map((m) => this.toMessageDto(m)),
    };
  }

  async softDelete(tenancy: Tenancy, conversationId: string, userId: string): Promise<void> {
    const conv = await this.findBuilderTestScoped(tenancy, conversationId);
    await this.conversations.update(conv.id, {
      deletedAt: new Date(),
      deletedBy: userId,
    });
  }

  async findScoped(tenancy: Tenancy, conversationId: string): Promise<Conversation> {
    const row = await this.conversations.findOne({
      where: {
        id: conversationId,
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        deletedAt: IsNull(),
      },
    });
    if (!row) throw new NotFoundException('Conversation not found');
    return row;
  }

  /** Editor test chat — rejects widget/api conversations. */
  async findBuilderTestScoped(tenancy: Tenancy, conversationId: string): Promise<Conversation> {
    const row = await this.findScoped(tenancy, conversationId);
    if (row.source !== BUILDER_TEST_SOURCE) {
      throw new NotFoundException('Conversation not found');
    }
    return row;
  }

  async assertWidgetConversation(
    tenancy: Tenancy,
    conversationId: string,
    visitorId: string,
  ): Promise<Conversation> {
    const row = await this.conversations.findOne({
      where: {
        id: conversationId,
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        visitorId,
        source: 'widget',
        deletedAt: IsNull(),
      },
    });
    if (!row) throw new NotFoundException('Conversation not found');
    return row;
  }

  async getWidgetDetail(
    tenancy: Tenancy,
    conversationId: string,
    visitorId: string,
  ): Promise<ConversationDetailDto> {
    const conv = await this.assertWidgetConversation(tenancy, conversationId, visitorId);
    const msgs = await this.messages.find({
      where: { conversationId: conv.id },
      order: { seq: 'ASC' },
    });
    return {
      id: conv.id,
      workflowId: conv.workflowId,
      title: conv.title,
      status: conv.status,
      source: conv.source,
      lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
      messages: msgs.map((m) => this.toMessageDto(m)),
    };
  }

  async listWidgetForWorkflow(
    tenancy: Tenancy,
    workflowId: string,
  ): Promise<ConversationListItem[]> {
    await this.assertWorkflow(tenancy, workflowId);
    const rows = await this.conversations.find({
      where: {
        workflowId,
        source: 'widget',
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        deletedAt: IsNull(),
      },
      order: { lastMessageAt: 'DESC', createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((r) => this.toListItem(r));
  }

  async allocateSeq(conversationId: string): Promise<number> {
    const result = await this.messages
      .createQueryBuilder('m')
      .select('COALESCE(MAX(m.seq), 0)', 'max')
      .where('m.conversation_id = :conversationId', { conversationId })
      .getRawOne<{ max: string }>();
    return Number(result?.max ?? 0) + 1;
  }

  async insertMessage(params: {
    conversationId: string;
    orgId: string;
    role: MessageRole;
    content: string;
    status: ConversationMessage['status'];
    seq: number;
    runId?: string | null;
  }): Promise<ConversationMessage> {
    const row = this.messages.create({
      conversationId: params.conversationId,
      orgId: params.orgId,
      role: params.role,
      content: params.content,
      status: params.status,
      seq: params.seq,
      runId: params.runId ?? null,
    });
    return this.messages.save(row);
  }

  async touchConversation(conversationId: string, at = new Date()): Promise<void> {
    await this.conversations.update(conversationId, { lastMessageAt: at });
  }

  async loadAgentHistory(conversationId: string): Promise<AgentInputItem[]> {
    const msgs = await this.messages.find({
      where: { conversationId, status: 'complete' },
      order: { seq: 'ASC' },
    });
    const items: AgentInputItem[] = [];
    for (const m of msgs) {
      if (m.role === 'user') {
        items.push({ type: 'message', role: 'user', content: m.content });
      } else if (m.role === 'assistant' && m.content) {
        items.push({
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: m.content }],
        });
      }
    }
    return items;
  }

  async getMessage(messageId: string, orgId: string): Promise<ConversationMessage | null> {
    return this.messages.findOne({ where: { id: messageId, orgId } });
  }

  private async assertWorkflow(tenancy: Tenancy, workflowId: string): Promise<void> {
    const wf = await this.workflows.findOne({
      where: {
        id: workflowId,
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        deletedAt: IsNull(),
      },
    });
    if (!wf) throw new NotFoundException('Workflow not found');
  }

  private toListItem(row: Conversation): ConversationListItem {
    return {
      id: row.id,
      workflowId: row.workflowId,
      title: row.title,
      status: row.status,
      source: row.source,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toMessageDto(m: ConversationMessage): MessageDto {
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      status: m.status,
      seq: m.seq,
      runId: m.runId,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      model: m.model,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
