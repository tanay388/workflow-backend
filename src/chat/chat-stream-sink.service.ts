import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RUN_EVENT_BUS, type RunEventBus } from '../common/queue/run-event-bus.interface';
import { RunStep } from '../runs/entities/run-step.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { ConversationService } from './conversation.service';

const STREAM_CHUNK_SIZE = 24;
const AGENT_NODE_TYPE = 'builtins.Agent';

@Injectable()
export class ChatStreamSink {
  private readonly logger = new Logger(ChatStreamSink.name);

  constructor(
    @InjectRepository(ConversationMessage)
    private readonly messages: Repository<ConversationMessage>,
    @InjectRepository(RunStep)
    private readonly steps: Repository<RunStep>,
    @Inject(RUN_EVENT_BUS) private readonly eventBus: RunEventBus,
    private readonly conversations: ConversationService,
  ) {}

  /** Persist incremental text and publish SSE token chunks (live SDK deltas). */
  async appendDelta(messageId: string, runId: string, delta: string): Promise<void> {
    if (!delta) return;
    const row = await this.messages.findOne({ where: { id: messageId } });
    if (!row) return;
    row.content = `${row.content}${delta}`;
    await this.messages.save(row);
    await this.publishTokenDelta(messageId, runId, delta);
  }

  /** Publish token chunks only — content is already persisted by the caller. */
  private async publishStreamChunks(
    messageId: string,
    runId: string,
    text: string,
  ): Promise<void> {
    for (let i = 0; i < text.length; i += STREAM_CHUNK_SIZE) {
      await this.publishTokenDelta(
        messageId,
        runId,
        text.slice(i, i + STREAM_CHUNK_SIZE),
      );
    }
  }

  private async publishTokenDelta(
    messageId: string,
    runId: string,
    delta: string,
  ): Promise<void> {
    if (!delta) return;
    await this.eventBus.publish(runId, {
      kind: 'token',
      runId,
      messageId,
      delta,
      ts: Date.now(),
    });
  }

  /** Append one agent segment; keeps message in `streaming` until finalizeAssistantMessage. */
  async appendAgentOutput(params: {
    messageId: string;
    runId: string;
    text: string;
    inputTokens: number;
    outputTokens: number;
    model: string;
  }): Promise<void> {
    const trimmed = params.text.trim();
    if (!trimmed) return;

    const row = await this.messages.findOne({ where: { id: params.messageId } });
    if (!row) return;

    const separator = row.content.trim() ? '\n\n' : '';
    const addition = `${separator}${trimmed}`;
    row.content = `${row.content}${addition}`;
    row.status = 'streaming';
    row.runId = params.runId;
    row.inputTokens = (row.inputTokens ?? 0) + params.inputTokens;
    row.outputTokens = (row.outputTokens ?? 0) + params.outputTokens;
    row.model = params.model;
    await this.messages.save(row);

    await this.publishStreamChunks(params.messageId, params.runId, addition);
  }

  async finalizeAssistantMessage(messageId: string, runId: string): Promise<void> {
    const row = await this.messages.findOne({ where: { id: messageId } });
    if (!row) return;

    if (!row.content.trim()) {
      const fromSteps = await this.collectAgentTextFromRun(runId);
      if (fromSteps) {
        row.content = fromSteps;
        await this.messages.save(row);
        await this.publishStreamChunks(messageId, runId, fromSteps);
      }
    }

    await this.messages.update(messageId, { status: 'complete', runId });
    await this.conversations.touchConversation(row.conversationId);

    await this.eventBus.publish(runId, {
      kind: 'token',
      runId,
      messageId,
      done: true,
      ts: Date.now(),
    });
  }

  private async collectAgentTextFromRun(runId: string): Promise<string> {
    const agentSteps = await this.steps.find({
      where: { runId, nodeType: AGENT_NODE_TYPE, status: In(['completed']) },
      order: { seq: 'ASC' },
    });
    const parts: string[] = [];
    for (const step of agentSteps) {
      const text = extractAgentStepText(step.output);
      if (text) parts.push(text);
    }
    return parts.join('\n\n');
  }

  async failMessage(messageId: string, runId: string, error?: string): Promise<void> {
    await this.messages.update(messageId, {
      status: 'failed',
      content: error ? `Error: ${error}` : '',
      runId,
    });
    const msg = await this.messages.findOne({ where: { id: messageId } });
    if (msg) {
      await this.conversations.touchConversation(msg.conversationId);
    }

    await this.eventBus.publish(runId, {
      kind: 'token',
      runId,
      messageId,
      done: true,
      ts: Date.now(),
    });
  }
}

function extractAgentStepText(output: unknown): string {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return '';
  const text = (output as Record<string, unknown>).text;
  return typeof text === 'string' ? text.trim() : '';
}
