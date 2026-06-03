import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalsModule } from '../approvals/approvals.module';
import { RunsModule } from '../runs/runs.module';
import { Workflow } from '../workflows/entities/workflow.entity';
import { Schedule } from './entities/schedule.entity';
import { ScheduleClaimService } from './schedule-claim.service';
import { SchedulesController, WorkflowSchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { SchedulerTickService } from './scheduler-tick.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Schedule, Workflow]),
    RunsModule,
    ApprovalsModule,
  ],
  controllers: [WorkflowSchedulesController, SchedulesController],
  providers: [SchedulesService, ScheduleClaimService, SchedulerTickService],
  exports: [SchedulesService, ScheduleClaimService],
})
export class SchedulerModule {}
