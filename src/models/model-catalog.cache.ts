import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TtlCache } from '../common/cache/ttl-cache';
import type {
  CatalogModelDto,
  LlmProvider,
  ModelRateResult,
} from '../common/llm/llm.types';
import { LlmModel } from './entities/llm-model.entity';

const CACHE_KEY = 'catalog';
/** 12 hours — catalog hot path TTL per Phase 17. */
export const MODEL_CATALOG_TTL_MS = 12 * 60 * 60 * 1000;
/** Re-warm at 90% of TTL (refresh-ahead). */
const REFRESH_AHEAD_RATIO = 0.9;

interface CatalogSnapshot {
  active: CatalogModelDto[];
  byKey: Map<string, CatalogModelDto>;
}

@Injectable()
export class ModelCatalogCache implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ModelCatalogCache.name);
  private readonly cache = new TtlCache<string, CatalogSnapshot>(MODEL_CATALOG_TTL_MS);
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(LlmModel) private readonly models: Repository<LlmModel>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
    this.scheduleRefreshAhead();
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }

  getActive(): CatalogModelDto[] {
    const snap = this.cache.get(CACHE_KEY);
    return snap?.active ?? [];
  }

  getRate(provider: string, modelKey: string): ModelRateResult {
    const snap = this.cache.get(CACHE_KEY);
    if (!snap) return { found: false };
    const row = snap.byKey.get(rateKey(provider, modelKey));
    if (!row) return { found: false };
    return {
      found: true,
      modelId: row.id,
      inputPricePerMillionUsd: row.inputPricePerMillionUsd,
      outputPricePerMillionUsd: row.outputPricePerMillionUsd,
    };
  }

  /** Cache-first lookup with DB fallback for metering correctness. */
  async getRateWithFallback(provider: string, modelKey: string): Promise<ModelRateResult> {
    const cached = this.getRate(provider, modelKey);
    if (cached.found) return cached;

    const model = await this.models.findOne({
      where: { provider: provider as LlmProvider, modelKey },
    });
    if (!model) return { found: false };

    this.logger.warn(
      `ModelCatalogCache miss for ${provider}/${modelKey} — loaded from DB`,
    );
    return {
      found: true,
      modelId: model.id,
      inputPricePerMillionUsd: model.inputPricePerMillionUsd,
      outputPricePerMillionUsd: model.outputPricePerMillionUsd,
    };
  }

  async refresh(): Promise<void> {
    const rows = await this.models.find({ order: { provider: 'ASC', modelKey: 'ASC' } });
    const dtos = rows.map(toDto);
    const byKey = new Map<string, CatalogModelDto>();
    for (const row of dtos) {
      byKey.set(rateKey(row.provider, row.modelKey), row);
    }
    const active = dtos.filter((r) => r.isActive);
    this.cache.set(CACHE_KEY, { active, byKey });
    this.scheduleRefreshAhead();
  }

  private scheduleRefreshAhead(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const delay = Math.floor(MODEL_CATALOG_TTL_MS * REFRESH_AHEAD_RATIO);
    this.refreshTimer = setTimeout(() => {
      void this.refresh().catch((err) =>
        this.logger.warn(`Catalog refresh-ahead failed: ${err}`),
      );
    }, delay);
  }
}

function rateKey(provider: string, modelKey: string): string {
  return `${provider}:${modelKey}`;
}

function toDto(model: LlmModel): CatalogModelDto {
  return {
    id: model.id,
    provider: model.provider,
    modelKey: model.modelKey,
    displayName: model.displayName,
    inputPricePerMillionUsd: model.inputPricePerMillionUsd,
    outputPricePerMillionUsd: model.outputPricePerMillionUsd,
    isActive: model.isActive,
  };
}

export { toDto as modelToDto };
