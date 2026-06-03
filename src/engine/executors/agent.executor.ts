import { Inject, Injectable, forwardRef } from '@nestjs/common';
import type { AgentInputItem } from '@openai/agents';
import type { WorkflowNode } from '../../common/types/graph';
import { buildAgentUserMessage } from '../../common/agent/agent-prompt';
import { AgentRuntimeService } from '../../common/agent/agent-runtime.service';
import { ChatStreamSink } from '../../chat/chat-stream-sink.service';
import type { NodeExecutor, NodeExecutorContext } from '../engine.types';

@Injectable()
export class AgentExecutor {
  constructor(
    private readonly runtime: AgentRuntimeService,
    @Inject(forwardRef(() => ChatStreamSink))
    private readonly chatStream: ChatStreamSink,
  ) {}

  execute: NodeExecutor = async (ctx, node: WorkflowNode) => {
    const config = ctx.resolveConfig(node.config ?? {});
    const input = ctx.getInput();
    const resolvedPrompt =
      typeof config.prompt === 'string' ? config.prompt : '';
    const userMessage = buildAgentUserMessage(
      resolvedPrompt,
      input,
      ctx.runInput,
      ctx.triggerSource,
    );

    const chatMeta = this.readChatMeta(ctx.runInput);
    const isChat =
      (ctx.triggerSource === 'chat' || ctx.triggerSource === 'widget') &&
      Boolean(ctx.messageId);
    const messageId = ctx.messageId ?? chatMeta?.assistantMessageId;

    const result = await this.runtime.execute(
      ctx.orgId,
      ctx.workspaceId,
      {
        provider: String(config.provider ?? 'openai'),
        model: String(config.model ?? 'gpt-4o'),
        instructions: String(config.instructions ?? ''),
        temperature: Number(config.temperature ?? 0.7),
        knowledge_base_id: (config.knowledge_base_id as string | null) ?? null,
        structured_output: (config.structured_output as Record<string, unknown>) ?? null,
        toolkits: Array.isArray(config.toolkits)
          ? (config.toolkits as string[])
          : [],
        toolkit_bindings: (config.toolkit_bindings as Record<string, { connection_id?: string; actions?: string[] }>) ?? {},
        connection_id: (config.connection_id as string | null) ?? (config.connected_account_id as string | null) ?? null,
      },
      userMessage,
      ctx.meter,
      {
        prior: chatMeta?.agentHistory,
        // Chat streams via appendAgentOutput after the agent finishes (SDK has no live deltas).
        onTextDelta: undefined,
      },
    );

    if (isChat && messageId && result.text.trim()) {
      await this.chatStream.appendAgentOutput({
        messageId,
        runId: ctx.runId,
        text: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: result.model,
      });
    }

    return {
      port: 'out',
      data: {
        text: result.text,
        structured: result.structured,
        tool_calls: result.tool_calls,
      },
    };
  };

  private readChatMeta(runInput: unknown): {
    assistantMessageId?: string;
    agentHistory?: AgentInputItem[];
  } | null {
    if (!runInput || typeof runInput !== 'object' || Array.isArray(runInput)) return null;
    const chat = (runInput as Record<string, unknown>)._chat;
    if (!chat || typeof chat !== 'object' || Array.isArray(chat)) return null;
    const c = chat as Record<string, unknown>;
    return {
      assistantMessageId:
        typeof c.assistantMessageId === 'string' ? c.assistantMessageId : undefined,
      agentHistory: Array.isArray(c.agentHistory) ? (c.agentHistory as AgentInputItem[]) : undefined,
    };
  }
}
