import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { AppConfigService } from '../common/config/config.service';
import { LLMClientFactory } from '../common/llm/llm-client.factory';
import { LlmProvider } from '../common/llm/llm.types';
import type { ConversationMessage } from './entities/conversation-message.entity';

@Injectable()
export class ConversationSummaryService {
  private readonly logger = new Logger(ConversationSummaryService.name);

  constructor(
    private readonly llmFactory: LLMClientFactory,
    private readonly cfg: AppConfigService,
  ) {}

  async summarizeMessages(
    orgId: string,
    messages: ConversationMessage[],
    existingSummary?: string,
  ): Promise<string> {
    if (messages.length === 0) return existingSummary?.trim() ?? '';

    const transcript = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 24_000);

    const prompt = existingSummary?.trim()
      ? `Existing summary:\n${existingSummary}\n\nNew messages to fold in:\n${transcript}`
      : transcript;

    try {
      const key = await this.llmFactory.resolveKey(orgId, LlmProvider.OPENAI);
      const client = new OpenAI({ apiKey: key.apiKey, baseURL: key.baseUrl });
      const response = await client.chat.completions.create({
        model: this.cfg.chatSummaryModel,
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          {
            role: 'system',
            content:
              'Summarize this conversation for future LLM context. Preserve user goals, decisions, names, IDs, and unresolved tasks. Be concise.',
          },
          { role: 'user', content: prompt },
        ],
      });
      const text = response.choices[0]?.message?.content?.trim();
      return text || existingSummary?.trim() || '';
    } catch (err) {
      this.logger.warn(
        `Conversation summary failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return existingSummary?.trim() ?? '';
    }
  }
}
