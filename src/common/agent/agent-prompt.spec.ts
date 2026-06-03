import { buildAgentUserMessage } from './agent-prompt';

describe('buildAgentUserMessage', () => {
  it('combines resolved prompt and chat message', () => {
    const msg = buildAgentUserMessage(
      'Summarize the topic',
      {},
      { topic: 'AI', message: 'Hello from chat' },
      'chat',
    );
    expect(msg).toBe('Summarize the topic\n\nHello from chat');
  });

  it('uses upstream when no prompt', () => {
    const msg = buildAgentUserMessage('', { text: 'upstream' }, {}, 'manual');
    expect(msg).toBe('upstream');
  });
});
