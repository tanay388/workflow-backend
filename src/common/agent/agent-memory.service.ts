import { Injectable } from '@nestjs/common';
import type { AgentInputItem } from '@openai/agents';

const MAX_HISTORY_ITEMS = 40;

@Injectable()
export class AgentMemoryService {
  /**
   * Build agent input from run context and trim unpaired tool results.
   */
  buildInput(userMessage: string, prior?: AgentInputItem[]): AgentInputItem[] {
    const history = this.trimHistory(prior ?? []);
    return [...history, { type: 'message', role: 'user', content: userMessage }];
  }

  trimHistory(items: AgentInputItem[]): AgentInputItem[] {
    const trimmed = items.slice(-MAX_HISTORY_ITEMS);
    const pending = new Set<string>();
    const out: AgentInputItem[] = [];

    for (const item of trimmed) {
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
