import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { Repository } from 'typeorm';
import { AppConfigService } from '../config/config.service';
import { CryptoService } from '../crypto/crypto.service';
import { LlmCredential, type LlmCredentialStatus } from '../../credentials/entities/llm-credential.entity';
import { MissingProviderKeyError } from './llm.errors';
import { ModelProviderRegistry } from './model-provider.registry';
import type {
  LlmKeyResolution,
  LlmProviderId,
  MeterContext,
  ResolvedLlmModel,
} from './llm.types';
import { TtlCache } from '../cache/ttl-cache';
import { DEFAULT_LLM_PROVIDER, isLlmProvider } from './llm.types';

const HAS_KEY_CACHE_MS = 60_000;

@Injectable()
export class LLMClientFactory {
  private readonly hasKeyCache = new TtlCache<string, boolean>(HAS_KEY_CACHE_MS);

  constructor(
    private readonly registry: ModelProviderRegistry,
    private readonly crypto: CryptoService,
    private readonly cfg: AppConfigService,
    @InjectRepository(LlmCredential)
    private readonly credentials: Repository<LlmCredential>,
  ) {}

  async getModel(
    orgId: string,
    provider: string,
    modelName: string,
    _meter?: MeterContext,
  ): Promise<ResolvedLlmModel> {
    const providerId = isLlmProvider(provider) ? provider : DEFAULT_LLM_PROVIDER;
    this.registry.resolve(providerId);
    const key = await this.resolveKey(orgId, providerId);
    const model = this.registry.buildModel(providerId, modelName, key);
    return {
      model,
      provider: providerId,
      modelName,
      byok: key.byok,
    };
  }

  async resolveKey(orgId: string, provider: LlmProviderId): Promise<LlmKeyResolution> {
    const cfg = this.registry.resolve(provider);
    const row = await this.credentials.findOne({
      where: { orgId, provider },
    });

    if (row?.status === 'valid') {
      const aad = this.aad(orgId, provider);
      return {
        apiKey: this.crypto.decrypt(row.encryptedKey, aad),
        byok: true,
        baseUrl: row.baseUrl ?? cfg.defaultBaseUrl,
      };
    }

    if (cfg.platformFallback) {
      const platform = this.cfg.openaiApiKey;
      if (!platform) {
        throw new MissingProviderKeyError(provider);
      }
      return { apiKey: platform, byok: false, baseUrl: row?.baseUrl ?? undefined };
    }

    throw new MissingProviderKeyError(provider);
  }

  async hasValidKey(orgId: string, provider: string): Promise<boolean> {
    if (!isLlmProvider(provider)) return false;
    const cacheKey = `${orgId}:${provider}`;
    const hit = this.hasKeyCache.get(cacheKey);
    if (hit !== undefined) return hit;

    const cfg = this.registry.resolve(provider);
    if (cfg.platformFallback && this.cfg.openaiApiKey) {
      this.hasKeyCache.set(cacheKey, true);
      return true;
    }
    const row = await this.credentials.findOne({
      where: { orgId, provider, status: 'valid' },
    });
    const ok = Boolean(row);
    this.hasKeyCache.set(cacheKey, ok);
    return ok;
  }

  aad(orgId: string, provider: string): string {
    return `org:${orgId}:llm:${provider}`;
  }

  /** Raw OpenAI SDK client (vector stores, file upload). */
  async createOpenAiClient(orgId: string): Promise<{ client: OpenAI; byok: boolean }> {
    const key = await this.resolveKey(orgId, DEFAULT_LLM_PROVIDER);
    const client = new OpenAI({
      apiKey: key.apiKey,
      ...(key.baseUrl ? { baseURL: key.baseUrl } : {}),
    });
    return { client, byok: key.byok };
  }

  async validateProviderKey(
    provider: LlmProviderId,
    apiKey: string,
    baseUrl?: string,
  ): Promise<LlmCredentialStatus> {
    try {
      const cfg = this.registry.resolve(provider);
      if (provider === 'anthropic') {
        const client = new Anthropic({ apiKey });
        await client.messages.create({
          model: 'claude-3-5-haiku-latest',
          max_tokens: 8,
          messages: [{ role: 'user', content: 'ping' }],
        });
        return 'valid';
      }
      const url = baseUrl ?? cfg.defaultBaseUrl;
      const client = new OpenAI({
        apiKey,
        ...(url ? { baseURL: url } : {}),
      });
      await client.models.list();
      return 'valid';
    } catch {
      return 'invalid';
    }
  }
}
