import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmModelPriceHistory } from './entities/llm-model-price-history.entity';
import { LlmModel } from './entities/llm-model.entity';
import { ModelCatalogCache } from './model-catalog.cache';
import { ModelCatalogService } from './model-catalog.service';
import { ModelsController } from './models.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LlmModel, LlmModelPriceHistory])],
  controllers: [ModelsController],
  providers: [ModelCatalogService, ModelCatalogCache],
  exports: [ModelCatalogService, ModelCatalogCache],
})
export class ModelsModule {}
