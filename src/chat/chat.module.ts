import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalsModule } from '../approvals/approvals.module';
import { EngineModule } from '../engine/engine.module';
import { RunsModule } from '../runs/runs.module';
import { RunStep } from '../runs/entities/run-step.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { WorkflowVersion } from '../workflows/entities/workflow-version.entity';
import { AgentModule } from '../common/agent/agent.module';
import { LlmModule } from '../common/llm/llm.module';
import { ChatStreamSink } from './chat-stream-sink.service';
import { ChatTurnStreamService } from './chat-turn-stream.service';
import { ChatTurnService } from './chat-turn.service';
import { ConversationHistoryService } from './conversation-history.service';
import { ConversationSummaryService } from './conversation-summary.service';
import { ConversationService } from './conversation.service';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import {
  ConversationsController,
  WorkflowConversationsController,
} from './conversations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      ConversationMessage,
      Workflow,
      WorkflowVersion,
      RunStep,
    ]),
    forwardRef(() => RunsModule),
    AgentModule,
    LlmModule,
    forwardRef(() => ApprovalsModule),
    forwardRef(() => EngineModule),
  ],
  controllers: [WorkflowConversationsController, ConversationsController],
  providers: [
    ConversationService,
    ConversationSummaryService,
    ConversationHistoryService,
    ChatTurnService,
    ChatStreamSink,
    ChatTurnStreamService,
  ],
  exports: [
    ConversationService,
    ConversationHistoryService,
    ChatTurnService,
    ChatStreamSink,
    ChatTurnStreamService,
  ],
})
export class ChatModule {}
