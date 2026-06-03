import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppConfigService } from '../config/config.service';
import { CryptoService } from '../crypto/crypto.service';
import { LlmCredential } from '../../credentials/entities/llm-credential.entity';
import { MissingProviderKeyError } from './llm.errors';
import { LLMClientFactory } from './llm-client.factory';
import { ModelProviderRegistry } from './model-provider.registry';

describe('LLMClientFactory', () => {
  let factory: LLMClientFactory;

  const credRepo = {
    findOne: jest.fn(),
  };

  const cfg = {
    openaiApiKey: 'platform-openai-key',
    defaultPricePerMillionUsd: 5,
  };

  beforeEach(async () => {
    credRepo.findOne.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        ModelProviderRegistry,
        LLMClientFactory,
        { provide: AppConfigService, useValue: cfg },
        {
          provide: CryptoService,
          useValue: { decrypt: () => 'byok-key', encrypt: () => Buffer.from('x') },
        },
        { provide: getRepositoryToken(LlmCredential), useValue: credRepo },
      ],
    }).compile();
    factory = module.get(LLMClientFactory);
  });

  it('OpenAI falls back to platform key when no BYOK', async () => {
    credRepo.findOne.mockResolvedValue(null);
    const key = await factory.resolveKey('org-1', 'openai');
    expect(key.byok).toBe(false);
    expect(key.apiKey).toBe('platform-openai-key');
  });

  it('OpenAI uses BYOK when valid credential exists', async () => {
    credRepo.findOne.mockResolvedValue({
      orgId: 'org-1',
      provider: 'openai',
      status: 'valid',
      encryptedKey: Buffer.from('enc'),
      baseUrl: null,
    });
    const key = await factory.resolveKey('org-1', 'openai');
    expect(key.byok).toBe(true);
    expect(key.apiKey).toBe('byok-key');
  });

  it('non-OpenAI without key throws MissingProviderKeyError', async () => {
    credRepo.findOne.mockResolvedValue(null);
    await expect(factory.resolveKey('org-1', 'anthropic')).rejects.toThrow(
      MissingProviderKeyError,
    );
  });
});
