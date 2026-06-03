import { BadRequestException, ConflictException } from '@nestjs/common';
import { LlmProvider } from '../common/llm/llm.types';
import { ModelCatalogService } from './model-catalog.service';

describe('ModelCatalogService', () => {
  const admin = { id: 'admin-1', email: 'a@x.com', name: 'Admin', role: 'superadmin' as const };

  const modelRow = {
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

  function makeService() {
    const models = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ ...modelRow, ...v, id: v.id ?? 'm1' })),
    };
    const history = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'h1', ...v })),
      find: jest.fn().mockResolvedValue([]),
    };
    const cache = { refresh: jest.fn(), getActive: jest.fn().mockReturnValue([]) };
    const audit = { record: jest.fn() };
    const service = new ModelCatalogService(
      models as never,
      history as never,
      cache as never,
      audit as never,
    );
    return { service, models, history, cache, audit };
  }

  it('create writes price history and audit', async () => {
    const { service, models, history, audit, cache } = makeService();
    models.findOne.mockResolvedValue(null);

    await service.create(admin, {
      provider: LlmProvider.OPENAI,
      modelKey: 'gpt-4o-mini',
      displayName: 'Mini',
      inputPricePerMillionUsd: '0.1500',
      outputPricePerMillionUsd: '0.6000',
    });

    expect(history.save).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'platform.model.created' }),
    );
    expect(cache.refresh).toHaveBeenCalled();
  });

  it('rejects duplicate provider+modelKey', async () => {
    const { service, models } = makeService();
    models.findOne.mockResolvedValue(modelRow);
    await expect(
      service.create(admin, {
        provider: LlmProvider.OPENAI,
        modelKey: 'gpt-4o',
        displayName: 'Dup',
        inputPricePerMillionUsd: '1',
        outputPricePerMillionUsd: '2',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deactivate triggers cache refresh', async () => {
    const { service, models, cache } = makeService();
    models.findOne.mockResolvedValue({ ...modelRow });
    await service.deactivate(admin, 'm1');
    expect(cache.refresh).toHaveBeenCalled();
  });

  it('rejects negative rates', async () => {
    const { service, models } = makeService();
    models.findOne.mockResolvedValue(null);
    await expect(
      service.create(admin, {
        provider: LlmProvider.OPENAI,
        modelKey: 'x',
        displayName: 'X',
        inputPricePerMillionUsd: '-1',
        outputPricePerMillionUsd: '1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
