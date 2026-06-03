import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmCredential } from '../../credentials/entities/llm-credential.entity';
import { LLMClientFactory } from './llm-client.factory';
import { ModelProviderRegistry } from './model-provider.registry';

@Module({
  imports: [TypeOrmModule.forFeature([LlmCredential])],
  providers: [ModelProviderRegistry, LLMClientFactory],
  exports: [ModelProviderRegistry, LLMClientFactory],
})
export class LlmModule {}
