import { Injectable } from '@nestjs/common';
import type { Model } from '@openai/agents';
import { OpenAIChatCompletionsModel } from '@openai/agents-openai';
import OpenAI from 'openai';
import { AnthropicModelProvider } from './anthropic-model.provider';
import { UnknownLlmProviderError } from './llm.errors';
import { LlmProvider, type LlmKeyResolution, type LlmProviderId, type ProviderConfig } from './llm.types';

const PROVIDER_CONFIGS: ProviderConfig[] = [
  { provider: LlmProvider.OPENAI, platformFallback: true },
  { provider: LlmProvider.ANTHROPIC, platformFallback: false },
  { provider: LlmProvider.DEEPSEEK, defaultBaseUrl: 'https://api.deepseek.com', platformFallback: false },
  { provider: LlmProvider.GROQ, defaultBaseUrl: 'https://api.groq.com/openai/v1', platformFallback: false },
  { provider: LlmProvider.TOGETHER, defaultBaseUrl: 'https://api.together.xyz/v1', platformFallback: false },
];

@Injectable()
export class ModelProviderRegistry {
  private readonly configs = new Map<LlmProviderId, ProviderConfig>(
    PROVIDER_CONFIGS.map((c) => [c.provider, c]),
  );

  resolve(provider: string): ProviderConfig {
    const cfg = this.configs.get(provider as LlmProviderId);
    if (!cfg) throw new UnknownLlmProviderError(provider);
    return cfg;
  }

  buildModel(
    provider: LlmProviderId,
    modelName: string,
    key: LlmKeyResolution,
  ): Model {
    if (provider === LlmProvider.ANTHROPIC) {
      return new AnthropicModelProvider(key.apiKey, modelName);
    }

    const baseURL = key.baseUrl ?? this.configs.get(provider)?.defaultBaseUrl;
    const client = new OpenAI({
      apiKey: key.apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
    return new OpenAIChatCompletionsModel(client, modelName);
  }

  listProviders(): ProviderConfig[] {
    return [...this.configs.values()];
  }
}
