import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { KnowledgeModule } from '../../knowledge/knowledge.module';
import { MeteringModule } from '../../metering/metering.module';
import { AgentMemoryService } from './agent-memory.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { HandoffService } from './handoff.service';
import { ConnectionsModule } from '../../connections/connections.module';

@Module({
  imports: [LlmModule, KnowledgeModule, MeteringModule, ConnectionsModule],
  providers: [AgentMemoryService, HandoffService, AgentRuntimeService],
  exports: [AgentRuntimeService, AgentMemoryService],
})
export class AgentModule {}
