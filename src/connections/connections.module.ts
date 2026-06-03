import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workflow } from '../workflows/entities/workflow.entity';
import { WorkflowVersion } from '../workflows/entities/workflow-version.entity';
import { ComposioService } from './composio.service';
import { ConnectionHealthService } from './connection-health.service';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { Connection } from './entities/connection.entity';
import { IntegrationCatalog } from './entities/integration-catalog.entity';
import { ToolResolverService } from './tool-resolver.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Connection,
      IntegrationCatalog,
      Workflow,
      WorkflowVersion,
    ]),
  ],
  controllers: [ConnectionsController],
  providers: [
    ComposioService,
    ConnectionsService,
    ConnectionHealthService,
    ToolResolverService,
  ],
  exports: [ConnectionsService, ComposioService, ToolResolverService],
})
export class ConnectionsModule {}
