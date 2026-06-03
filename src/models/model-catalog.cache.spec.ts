import { LlmProvider } from '../common/llm/llm.types';
import {
  MODEL_CATALOG_TTL_MS,
  ModelCatalogCache,
} from './model-catalog.cache';
import { LlmModel } from './entities/llm-model.entity';

describe('ModelCatalogCache', () => {
  const gpt4o: LlmModel = {
    id: 'm1',
    provider: LlmProvider.OPENAI,
    modelKey: 'gpt-4o',
    displayName: 'GPT-4o',
    inputPricePerMillionUsd: '2.5000',
    outputPricePerMillionUsd: '10.0000',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
  };

  const inactive: LlmModel = {
    ...gpt4o,
    id: 'm2',
    modelKey: 'old-model',
    displayName: 'Old',
    isActive: false,
  };

  function makeCache(rows: LlmModel[]) {
    const repo = {
      find: jest.fn().mockResolvedValue(rows),
      findOne: jest.fn(async ({ where }: { where: { provider: LlmProvider; modelKey: string } }) =>
        rows.find((r) => r.provider === where.provider && r.modelKey === where.modelKey) ?? null,
      ),
    };
    const cache = new ModelCatalogCache(repo as never);
    return { cache, repo };
  }

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('getActive excludes inactive models', async () => {
    const { cache } = makeCache([gpt4o, inactive]);
    await cache.refresh();
    expect(cache.getActive()).toHaveLength(1);
    expect(cache.getActive()[0]?.modelKey).toBe('gpt-4o');
    cache.onModuleDestroy();
  });

  it('getRate resolves inactive models for historical cost', async () => {
    const { cache } = makeCache([gpt4o, inactive]);
    await cache.refresh();
    const rate = cache.getRate('openai', 'old-model');
    expect(rate.found).toBe(true);
    if (rate.found) {
      expect(rate.inputPricePerMillionUsd).toBe('2.5000');
    }
    cache.onModuleDestroy();
  });

  it('getRate returns miss for unknown model', async () => {
    const { cache } = makeCache([gpt4o]);
    await cache.refresh();
    expect(cache.getRate('openai', 'missing')).toEqual({ found: false });
    cache.onModuleDestroy();
  });

  it('refresh returns fresh rates after price change', async () => {
    const { cache, repo } = makeCache([gpt4o]);
    await cache.refresh();
    const updated = { ...gpt4o, inputPricePerMillionUsd: '3.0000' };
    repo.find.mockResolvedValue([updated]);
    await cache.refresh();
    const rate = cache.getRate('openai', 'gpt-4o');
    expect(rate.found).toBe(true);
    if (rate.found) expect(rate.inputPricePerMillionUsd).toBe('3.0000');
    cache.onModuleDestroy();
  });

  it('getRateWithFallback loads from DB on cache miss', async () => {
    const { cache, repo } = makeCache([]);
    repo.findOne.mockResolvedValue(gpt4o);
    const rate = await cache.getRateWithFallback('openai', 'gpt-4o');
    expect(rate.found).toBe(true);
    if (rate.found) expect(rate.inputPricePerMillionUsd).toBe('2.5000');
    cache.onModuleDestroy();
  });

  it('uses 12h TTL constant', () => {
    expect(MODEL_CATALOG_TTL_MS).toBe(12 * 60 * 60 * 1000);
  });
});
