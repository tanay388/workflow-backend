import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AgentInputItem } from '@openai/agents';
import { Repository } from 'typeorm';
import { AgentMemoryService } from '../common/agent/agent-memory.service';
import { AppConfigService } from '../common/config/config.service';
import { estimateTokens } from '../common/utils/tokens';
import { ConversationSummaryService } from './conversation-summary.service';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';

export interface ConversationMemoryState {
  summary?: string;
  summarizedThroughSeq?: number;
  updatedAt?: string;
}

@Injectable()
export class ConversationHistoryService {
  constructor(
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private readonly messages: Repository<ConversationMessage>,
    private readonly memory: AgentMemoryService,
    private readonly summary: ConversationSummaryService,
    private readonly cfg: AppConfigService,
  ) {}

  async buildAgentHistory(conversationId: string, orgId: string): Promise<AgentInputItem[]> {
    const conv = await this.conversations.findOne({ where: { id: conversationId, orgId } });
    if (!conv) return [];

    const msgs = await this.messages.find({
      where: { conversationId, status: 'complete' },
      order: { seq: 'ASC' },
    });
    if (msgs.length === 0) return [];

    const tokenBudget = this.cfg.chatHistoryTokenBudget;
    const recentKeep = this.cfg.chatRecentMessagesKeep;
    const recentMsgs = msgs.slice(-recentKeep);
    const olderMsgs = msgs.slice(0, Math.max(0, msgs.length - recentKeep));

    let memoryState = (conv.memory ?? {}) as ConversationMemoryState;
    let summaryText = memoryState.summary?.trim() ?? '';

    const estimateHistory = (summary: string, recent: ConversationMessage[]) => {
      const summaryTokens = estimateTokens(summary);
      const recentItems = this.messagesToAgentItems(recent);
      const recentTokens = recentItems.reduce(
        (sum, item) => sum + this.memory.estimateItemTokens(item),
        0,
      );
      return summaryTokens + recentTokens;
    };

    if (olderMsgs.length > 0 && estimateHistory(summaryText, recentMsgs) > tokenBudget) {
      const toSummarize = olderMsgs.filter(
        (m) => m.seq > (memoryState.summarizedThroughSeq ?? 0),
      );
      const batch = toSummarize.length > 0 ? toSummarize : olderMsgs;
      summaryText = await this.summary.summarizeMessages(orgId, batch, summaryText);
      const lastSummarized = batch[batch.length - 1]!;
      memoryState = {
        summary: summaryText,
        summarizedThroughSeq: lastSummarized.seq,
        updatedAt: new Date().toISOString(),
      };
      await this.conversations.update(conversationId, {
        memory: { ...memoryState },
      });
    }

    const out: AgentInputItem[] = [];
    if (summaryText) {
      out.push({
        type: 'message',
        role: 'user',
        content: `[Conversation summary]\n${summaryText}`,
      });
    }
    out.push(...this.messagesToAgentItems(recentMsgs));

    return this.memory.trimHistory(out, tokenBudget);
  }

  private messagesToAgentItems(messages: ConversationMessage[]): AgentInputItem[] {
    const items: AgentInputItem[] = [];
    for (const m of messages) {
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
}
