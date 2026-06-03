import type { Model } from '@openai/agents';

export enum LlmProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  GROQ = 'groq',
  TOGETHER = 'together',
}

export const LLM_PROVIDERS = Object.values(LlmProvider) as LlmProvider[];

export type LlmProviderId = LlmProvider;

export const DEFAULT_LLM_PROVIDER: LlmProviderId = LlmProvider.OPENAI;

export function isLlmProvider(value: string): value is LlmProviderId {
  return (LLM_PROVIDERS as readonly string[]).includes(value);
}

export interface MeterContext {
  orgId: string;
  workspaceId: string;
  workflowId: string;
  runId: string;
  stepId: string;
  nodeId: string;
}

export interface ResolvedLlmModel {
  model: Model;
  provider: LlmProviderId;
  modelName: string;
  byok: boolean;
}

export interface ProviderConfig {
  provider: LlmProviderId;
  /** Default base URL for OpenAI-compatible providers. */
  defaultBaseUrl?: string;
  /** OpenAI is the only provider with platform key fallback. */
  platformFallback: boolean;
}

export interface LlmKeyResolution {
  apiKey: string;
  byok: boolean;
  baseUrl?: string;
}

/** Per-model USD rates (per 1M tokens) returned by {@link ModelCatalogCache.getRate}. */
export interface ModelRate {
  modelId: string;
  inputPricePerMillionUsd: string;
  outputPricePerMillionUsd: string;
}

export interface ModelRateLookup extends ModelRate {
  found: true;
}

export interface ModelRateMiss {
  found: false;
}

export type ModelRateResult = ModelRateLookup | ModelRateMiss;

/** Active catalog row exposed to tenants and admin list endpoints. */
export interface CatalogModelDto {
  id: string;
  provider: LlmProvider;
  modelKey: string;
  displayName: string;
  inputPricePerMillionUsd: string;
  outputPricePerMillionUsd: string;
  isActive: boolean;
}
