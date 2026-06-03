import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentModule } from '../common/agent/agent.module';
import { RecaptchaModule } from '../common/recaptcha/recaptcha.module';
import { ChatModule } from '../chat/chat.module';
import { Conversation } from '../chat/entities/conversation.entity';
import { ConversationMessage } from '../chat/entities/conversation-message.entity';
import { FormsModule } from '../forms/forms.module';
import { RunsModule } from '../runs/runs.module';
import { EngineModule } from '../engine/engine.module';
import { Workflow } from '../workflows/entities/workflow.entity';
import { WorkflowVersion } from '../workflows/entities/workflow-version.entity';
import { ChatVisitor } from './entities/chat-visitor.entity';
import { ChatWidget } from './entities/chat-widget.entity';
import { PublicWidgetController } from './public-widget.controller';
import { PublicWidgetService } from './public-widget.service';
import { VisitorService } from './visitor.service';
import { WidgetRateLimitService } from './widget-rate-limit.service';
import { WidgetTurnService } from './widget-turn.service';
import { WidgetService } from './widget.service';
import { Form } from '../forms/entities/form.entity';
import { FormSubmission } from '../forms/entities/form-submission.entity';
import { WorkflowRun } from '../runs/entities/workflow-run.entity';
import { WidgetInsightsService } from './widget-insights.service';
import { WidgetSessionService } from './widget-session.service';
import { WidgetsController } from './widgets.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatWidget,
      ChatVisitor,
      Conversation,
      ConversationMessage,
      Form,
      FormSubmission,
      WorkflowRun,
      Workflow,
      WorkflowVersion,
    ]),
    RecaptchaModule,
    AgentModule,
    FormsModule,
    forwardRef(() => ChatModule),
    forwardRef(() => RunsModule),
    forwardRef(() => EngineModule),
  ],
  controllers: [WidgetsController, PublicWidgetController],
  providers: [
    WidgetService,
    PublicWidgetService,
    VisitorService,
    WidgetRateLimitService,
    WidgetTurnService,
    WidgetSessionService,
    WidgetInsightsService,
  ],
  exports: [WidgetService, PublicWidgetService, VisitorService],
})
export class WidgetsModule {}
