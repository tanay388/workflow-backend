import { Injectable, Logger } from '@nestjs/common';
import {
  Agent,
  extractAllTextOutput,
  run,
  type AgentOutputType,
  type Tool,
} from '@openai/agents';
import { fileSearchTool } from '@openai/agents-openai';
import { LLMClientFactory } from '../llm/llm-client.factory';
import type { MeterContext } from '../llm/llm.types';
import { DEFAULT_LLM_PROVIDER, isLlmProvider } from '../llm/llm.types';
import { KnowledgeService } from '../../knowledge/knowledge.service';
import { MeteringServiceImpl } from '../../metering/metering.service';
import { estimateTokens } from '../utils/tokens';
import { AgentMemoryService } from './agent-memory.service';
import { ToolResolverService, type ToolkitBinding } from '../../connections/tool-resolver.service';
import type { Tenancy } from '../tenancy/tenancy-context.service';

export interface AgentRunConfig {
  provider?: string;
  model?: string;
  instructions: string;
  temperature?: number;
  knowledge_base_id?: string | null;
  structured_output?: Record<string, unknown> | null;
  toolkits?: string[];
  toolkit_bindings?: Record<string, ToolkitBinding>;
  connection_id?: string | null;
}

export interface AgentRunResult {
  text: string;
  structured: unknown | null;
  tool_calls: unknown[];
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
}

export interface AgentExecuteOptions {
  prior?: import('@openai/agents').AgentInputItem[];
  onTextDelta?: (delta: string) => Promise<void>;
}

@Injectable()
export class AgentRuntimeService {
  private readonly logger = new Logger(AgentRuntimeService.name);

  constructor(
    private readonly llmFactory: LLMClientFactory,
    private readonly memory: AgentMemoryService,
    private readonly tools: ToolResolverService,
    private readonly knowledge: KnowledgeService,
    private readonly tokenUsage: MeteringServiceImpl,
  ) {}

  async execute(
    orgId: string,
    workspaceId: string,
    config: AgentRunConfig,
    userInput: string,
    meter?: MeterContext,
    options?: AgentExecuteOptions,
  ): Promise<AgentRunResult> {
    const provider = isLlmProvider(config.provider ?? '')
      ? config.provider!
      : DEFAULT_LLM_PROVIDER;
    const modelName = config.model ?? 'gpt-4o';
    const resolved = await this.llmFactory.getModel(orgId, provider, modelName, meter);

    const kbTools = await this.knowledgeTools(config.knowledge_base_id);
    const tenancy: Tenancy = { orgId, workspaceId };
    const composioTools = await this.tools.resolveTools(
      tenancy,
      config.toolkit_bindings ?? {},
      config.toolkits,
      config.connection_id,
    );
    const tools: Tool[] = [...kbTools, ...composioTools];
    this.logger.log(
      `Agent tools: ${kbTools.length} knowledge + ${composioTools.length} Composio (toolkits=${(config.toolkits ?? []).join(',') || 'none'})`,
    );

    const outputType = config.structured_output
      ? ({
          type: 'json_schema' as const,
          name: 'agent_output',
          schema: {
            type: 'object',
            properties: config.structured_output as Record<string, unknown>,
            required: Object.keys(config.structured_output),
            additionalProperties: false,
          },
          strict: false,
        } as const)
      : 'text';

    const agent = new Agent({
      name: 'Workflow Agent',
      instructions: config.instructions,
      model: resolved.model,
      tools,
      outputType: outputType as AgentOutputType<unknown>,
      modelSettings: {
        temperature: config.temperature ?? 0.7,
      },
    });

    const input = this.memory.buildInput(
      typeof userInput === 'string' ? userInput : JSON.stringify(userInput),
      options?.prior,
    );

    const result = await run(agent, input);
    const text = extractAllTextOutput(result.newItems) ?? '';

    if (options?.onTextDelta && text) {
      await this.emitChunked(text, options.onTextDelta);
    }
    const loopCalls = (result.rawResponses ?? [])
      .map((resp) => resp.usage)
      .filter((usage): usage is NonNullable<typeof usage> => Boolean(usage))
      .map((usage) => ({
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      }));

    const inputTokens = loopCalls.reduce((sum, c) => sum + c.inputTokens, 0);
    const outputTokens = loopCalls.reduce((sum, c) => sum + c.outputTokens, 0);
    const fallbackInput = estimateTokens(config.instructions + userInput);
    const fallbackOutput = estimateTokens(text);
    const totalInput = inputTokens > 0 ? inputTokens : fallbackInput;
    const totalOutput = outputTokens > 0 ? outputTokens : fallbackOutput;

    if (meter) {
      if (loopCalls.length > 1) {
        await this.tokenUsage.recordLoop({
          meter,
          provider: resolved.provider,
          model: resolved.modelName,
          byok: resolved.byok,
          calls: loopCalls,
        });
      } else {
        await this.tokenUsage.record({
          meter,
          provider: resolved.provider,
          model: resolved.modelName,
          inputTokens: totalInput,
          outputTokens: totalOutput,
          byok: resolved.byok,
        });
      }
    }

    return {
      text,
      structured: this.parseStructured(text, config.structured_output),
      tool_calls: [],
      inputTokens: totalInput,
      outputTokens: totalOutput,
      model: resolved.modelName,
      provider: resolved.provider,
    };
  }

  private async emitChunked(text: string, onDelta: (delta: string) => Promise<void>): Promise<void> {
    const size = 24;
    for (let i = 0; i < text.length; i += size) {
      await onDelta(text.slice(i, i + size));
    }
  }

  private async knowledgeTools(knowledgeBaseId?: string | null): Promise<Tool[]> {
    const defs = await this.knowledge.buildFileSearchTool(knowledgeBaseId);
    return defs.map((d) =>
      fileSearchTool(d.vector_store_ids, { maxNumResults: d.max_num_results }),
    ) as Tool[];
  }

  private parseStructured(text: string, schema: unknown): unknown | null {
    if (!schema) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }
}
