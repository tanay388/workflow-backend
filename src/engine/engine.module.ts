import { Module, forwardRef } from '@nestjs/common';
import { AgentModule } from '../common/agent/agent.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ConnectionsModule } from '../connections/connections.module';
import { LlmModule } from '../common/llm/llm.module';
import { VariablesModule } from '../variables/variables.module';
import { ByokValidationService } from './byok-validation.service';
import { ContextResolver } from './context-resolver';
import { ActionExecutor } from './executors/action.executor';
import { AgentExecutor } from './executors/agent.executor';
import { UserApprovalExecutor } from './executors/user-approval.executor';
import { WaitExecutor } from './executors/wait.executor';
import { NodeRegistry } from './node-registry';
import { WorkflowEngine } from './workflow-engine';
import { ChatModule } from 'src/chat/chat.module';

@Module({
  imports: [
    VariablesModule,
    LlmModule,
    AgentModule,
    ConnectionsModule,
    forwardRef(() => ApprovalsModule),
    forwardRef(() => ChatModule),
  ],
  providers: [
    ContextResolver,
    NodeRegistry,
    WorkflowEngine,
    AgentExecutor,
    ActionExecutor,
    WaitExecutor,
    UserApprovalExecutor,
    ByokValidationService,
  ],
  exports: [WorkflowEngine, NodeRegistry, ContextResolver, ByokValidationService],
})
export class EngineModule {}
