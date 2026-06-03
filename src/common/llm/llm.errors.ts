export class UnknownLlmProviderError extends Error {
  constructor(readonly provider: string) {
    super(`Unknown LLM provider: ${provider}`);
    this.name = 'UnknownLlmProviderError';
  }
}

export class MissingProviderKeyError extends Error {
  constructor(readonly provider: string) {
    super(`Add your ${provider} API key in Settings → LLM Keys before running this workflow.`);
    this.name = 'MissingProviderKeyError';
  }
}
