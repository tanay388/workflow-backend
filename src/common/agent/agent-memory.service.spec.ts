import { AgentMemoryService } from './agent-memory.service';

describe('AgentMemoryService', () => {
  const svc = new AgentMemoryService();

  it('drops unpaired tool results', () => {
    const trimmed = svc.trimHistory([
      { type: 'function_call', callId: 'a', name: 'tool', arguments: '{}' },
      {
        type: 'function_call_result',
        callId: 'orphan',
        output: 'x',
      },
      {
        type: 'function_call_result',
        callId: 'a',
        output: 'ok',
      },
    ]);
    expect(trimmed).toHaveLength(2);
    expect(trimmed[1]?.type).toBe('function_call_result');
  });

  it('trims oldest items when token budget is exceeded', () => {
    const items = [
      { type: 'message', role: 'user', content: 'a'.repeat(400) },
      { type: 'message', role: 'user', content: 'b'.repeat(400) },
      { type: 'message', role: 'user', content: 'recent' },
    ] as never[];
    const trimmed = svc.trimByTokenBudget(items, 120);
    expect(trimmed.length).toBeLessThan(items.length);
    expect(trimmed.at(-1)).toMatchObject({ content: 'recent' });
  });
});
