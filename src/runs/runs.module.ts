import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { RUN_QUEUE } from '../common/queue/run-queue.interface';
import { RUN_EVENT_BUS } from '../common/queue/run-event-bus.interface';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ChatModule } from '../chat/chat.module';
import { TriggersModule } from '../triggers/triggers.module';
import { MeteringModule } from '../metering/metering.module';
import { MeteringServiceImpl } from '../metering/metering.service';
import { EngineModule } from '../engine/engine.module';
import { WorkflowVersion } from '../workflows/entities/workflow-version.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { RunStep } from './entities/run-step.entity';
import { WorkflowRun } from './entities/workflow-run.entity';
import { PgRunEventBus } from './pg-run-event-bus.service';
import { PgRunQueue } from './pg-run-queue.service';
import { RunDispatcherService } from './run-dispatcher.service';
import { RunEnqueueListener } from './run-enqueue-listener.service';
import { RunExecutorService } from './run-executor.service';
import { RunQueryService } from './run-query.service';
import { RunStreamService } from './run-stream.service';
import { RunService } from './run.service';
import { RunSweeperService } from './run-sweeper.service';
import { RunsController, WorkflowRunController } from './runs.controller';

@Module({
  imports: [
    MeteringModule,
    forwardRef(() => EngineModule),
    forwardRef(() => ApprovalsModule),
    forwardRef(() => TriggersModule),
    forwardRef(() => ChatModule),
    TypeOrmModule.forFeature([WorkflowRun, RunStep, Workflow, WorkflowVersion, User]),
  ],
  controllers: [RunsController, WorkflowRunController],
  providers: [
    PgRunQueue,
    PgRunEventBus,
    RunEnqueueListener,
    RunDispatcherService,
    RunSweeperService,
    RunExecutorService,
    RunService,
    RunQueryService,
    RunStreamService,
    { provide: RUN_QUEUE, useExisting: PgRunQueue },
    { provide: RUN_EVENT_BUS, useExisting: PgRunEventBus },
  ],
  exports: [RunService, RunQueryService, RUN_QUEUE, RUN_EVENT_BUS],
})
export class RunsModule implements OnModuleInit {
  constructor(private readonly dispatcher: RunDispatcherService) {}

  onModuleInit(): void {
    this.dispatcher.start();
  }
}
