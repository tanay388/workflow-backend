import Anthropic from '@anthropic-ai/sdk';
import type {
  AgentInputItem,
  AgentOutputItem,
  Model,
  ModelRequest,
  ModelResponse,
  ResponseStreamEvent,
  SerializedTool,
} from '@openai/agents';
import { Usage } from '@openai/agents';

type AnthropicMessage = Anthropic.Messages.MessageParam;
type AnthropicTool = Anthropic.Messages.Tool;

/**
 * Native Claude adapter for the OpenAI Agents SDK {@link Model} interface.
 */
export class AnthropicModelProvider implements Model {
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly modelName: string) {
    this.client = new Anthropic({ apiKey });
  }

  async getResponse(request: ModelRequest): Promise<ModelResponse> {
    const messages = this.toAnthropicMessages(request.input);
    const tools = this.toAnthropicTools(request.tools);
    const temperature = request.modelSettings.temperature ?? undefined;
    const maxTokens = request.modelSettings.maxTokens ?? 4096;

    const params: Anthropic.Messages.MessageCreateParams = {
      model: this.modelName,
      max_tokens: maxTokens,
      messages,
      ...(request.systemInstructions ? { system: request.systemInstructions } : {}),
      ...(tools.length > 0 ? { tools } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
    };

    const structured = this.structuredSchema(request);
    if (structured) {
      params.tools = [
        ...(params.tools ?? []),
        {
          name: 'structured_output',
          description: 'Return the final answer as structured JSON',
          input_schema: structured,
        },
      ];
      params.tool_choice = { type: 'tool', name: 'structured_output' };
    }

    const response = await this.client.messages.create(params);
    const output = this.toAgentOutput(response);
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;

    return {
      usage: new Usage({
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      }),
      output,
      responseId: response.id,
      providerData: { provider: 'anthropic' },
    };
  }

  async *getStreamedResponse(request: ModelRequest): AsyncIterable<ResponseStreamEvent> {
    const full = await this.getResponse(request);
    yield { type: 'response_done', response: { ...full, id: full.responseId ?? 'anthropic' } } as unknown as ResponseStreamEvent;
  }

  private structuredSchema(
    request: ModelRequest,
  ): Anthropic.Messages.Tool.InputSchema | null {
    const ot = request.outputType;
    if (ot === 'text' || !ot || typeof ot === 'string') return null;
    if (typeof ot === 'object' && 'schema' in ot && ot.schema) {
      return ot.schema as Anthropic.Messages.Tool.InputSchema;
    }
    return null;
  }

  private toAnthropicTools(tools: SerializedTool[]): AnthropicTool[] {
    return tools
      .filter((t) => t.type === 'function')
      .map((t) => ({
        name: t.name,
        description: t.description ?? '',
        input_schema: (t.parameters ?? {
          type: 'object',
          properties: {},
        }) as AnthropicTool['input_schema'],
      }));
  }

  private toAnthropicMessages(input: string | AgentInputItem[]): AnthropicMessage[] {
    if (typeof input === 'string') {
      return [{ role: 'user', content: input }];
    }

    const out: AnthropicMessage[] = [];
    for (const item of input) {
      if (item.type === 'message') {
        const role = item.role === 'assistant' ? 'assistant' : 'user';
        const text =
          typeof item.content === 'string'
            ? item.content
            : Array.isArray(item.content)
              ? item.content
                  .filter((p) => p.type === 'input_text' || p.type === 'output_text')
                  .map((p) => ('text' in p ? String(p.text) : ''))
                  .join('')
              : '';
        if (text) out.push({ role, content: text });
      } else if (item.type === 'function_call') {
        out.push({
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: item.callId ?? item.id ?? 'call',
              name: item.name,
              input: this.parseToolArgs(item.arguments),
            },
          ],
        });
      } else if (item.type === 'function_call_result') {
        out.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: item.callId ?? 'call',
              content:
                typeof item.output === 'string'
                  ? item.output
                  : JSON.stringify(item.output ?? ''),
            },
          ],
        });
      }
    }
    return out;
  }

  private parseToolArgs(raw: unknown): Record<string, unknown> {
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
    return {};
  }

  private toAgentOutput(response: Anthropic.Messages.Message): AgentOutputItem[] {
    const items: AgentOutputItem[] = [];
    const textParts: string[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        items.push({
          type: 'function_call',
          callId: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
          status: 'completed',
        });
      }
    }

    if (textParts.length > 0) {
      items.unshift({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: textParts.join('\n') }],
        status: 'completed',
      });
    }

    return items;
  }
}
