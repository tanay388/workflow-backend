import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowRun } from '../runs/entities/workflow-run.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { EngineModule } from '../engine/engine.module';
import { ActionTokenService } from './action-token.service';
import { ApprovalService } from './approval.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalRequest } from './entities/approval-request.entity';
import { TriggerSubscription } from './entities/trigger-subscription.entity';
import { PublicActionsController } from './public-actions.controller';
import { WaitService } from './wait.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApprovalRequest,
      TriggerSubscription,
      WorkflowRun,
      Workflow,
    ]),
    forwardRef(() => EngineModule),
  ],
  controllers: [ApprovalsController, PublicActionsController],
  providers: [ActionTokenService, WaitService, ApprovalService],
  exports: [WaitService, ApprovalService, ActionTokenService],
})
export class ApprovalsModule {}
