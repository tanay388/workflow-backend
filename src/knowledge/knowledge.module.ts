import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmModule } from '../common/llm/llm.module';
import { ObjectStorageService } from '../common/storage/object-storage.service';
import { KnowledgeBase } from './entities/knowledge-base.entity';
import { KnowledgeFile } from './entities/knowledge-file.entity';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeBase, KnowledgeFile]), LlmModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, ObjectStorageService],
  exports: [KnowledgeService, TypeOrmModule],
})
export class KnowledgeModule {}
