import { ModelProviderRegistry } from './model-provider.registry';
import { UnknownLlmProviderError } from './llm.errors';

describe('ModelProviderRegistry', () => {
  const registry = new ModelProviderRegistry();

  it('resolves openai, anthropic, deepseek', () => {
    expect(registry.resolve('openai').platformFallback).toBe(true);
    expect(registry.resolve('anthropic').platformFallback).toBe(false);
    expect(registry.resolve('deepseek').defaultBaseUrl).toContain('deepseek');
  });

  it('throws for unknown provider', () => {
    expect(() => registry.resolve('unknown')).toThrow(UnknownLlmProviderError);
  });

  it('builds OpenAI-compatible model with base_url', () => {
    const model = registry.buildModel('deepseek', 'deepseek-chat', {
      apiKey: 'sk-test',
      byok: true,
      baseUrl: 'https://api.deepseek.com',
    });
    expect(model).toBeDefined();
    expect(model.getResponse).toBeDefined();
  });
});
