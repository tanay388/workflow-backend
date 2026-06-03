import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { EngineModule } from '../engine/engine.module';
import { VariablesModule } from '../variables/variables.module';
import { WorkflowVersion } from './entities/workflow-version.entity';
import { Workflow } from './entities/workflow.entity';
import { WorkflowsController } from './workflows.controller';
import { WorkflowVersionsService } from './workflow-versions.service';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workflow, WorkflowVersion, User]),
    VariablesModule,
    EngineModule,
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowVersionsService],
  exports: [WorkflowsService, WorkflowVersionsService],
})
export class WorkflowsModule {}
