import { Injectable } from '@nestjs/common';
import type { AgentInputItem } from '@openai/agents';
import { estimateTokens } from '../utils/tokens';

const MAX_HISTORY_ITEMS = 40;

@Injectable()
export class AgentMemoryService {
  /**
   * Build agent input from run context and trim unpaired tool results.
   */
  buildInput(
    userMessage: string,
    prior?: AgentInputItem[],
    maxTokenBudget?: number,
  ): AgentInputItem[] {
    const history = this.trimHistory(prior ?? [], maxTokenBudget);
    return [...history, { type: 'message', role: 'user', content: userMessage }];
  }

  trimHistory(items: AgentInputItem[], maxTokenBudget?: number): AgentInputItem[] {
    const paired = this.dropUnpairedToolResults(items);
    const countTrimmed =
      paired.length > MAX_HISTORY_ITEMS ? paired.slice(-MAX_HISTORY_ITEMS) : paired;
    if (!maxTokenBudget || maxTokenBudget <= 0) return countTrimmed;
    return this.trimByTokenBudget(countTrimmed, maxTokenBudget);
  }

  trimByTokenBudget(items: AgentInputItem[], maxTokenBudget: number): AgentInputItem[] {
    if (items.length === 0) return items;

    const tokenCounts = items.map((item) => this.estimateItemTokens(item));
    let total = tokenCounts.reduce((sum, n) => sum + n, 0);
    if (total <= maxTokenBudget) return items;

    let start = 0;
    while (start < items.length - 1 && total > maxTokenBudget) {
      total -= tokenCounts[start]!;
      start++;
    }

    return this.dropUnpairedToolResults(items.slice(start));
  }

  estimateItemTokens(item: AgentInputItem): number {
    if (item.type === 'message') {
      const content = item.content;
      if (typeof content === 'string') return estimateTokens(content);
      return estimateTokens(JSON.stringify(content));
    }
    return estimateTokens(JSON.stringify(item));
  }

  private dropUnpairedToolResults(items: AgentInputItem[]): AgentInputItem[] {
    const pending = new Set<string>();
    const out: AgentInputItem[] = [];

    for (const item of items) {
      if (item.type === 'function_call') {
        const id = item.callId ?? item.id;
        if (id) pending.add(id);
        out.push(item);
      } else if (item.type === 'function_call_result') {
        const id = item.callId;
        if (id && pending.has(id)) {
          pending.delete(id);
          out.push(item);
        }
      } else {
        out.push(item);
      }
    }

    return out;
  }
}
