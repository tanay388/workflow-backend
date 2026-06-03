import { composioEntityId } from './composio-entity.util';

describe('composioEntityId', () => {
  it('derives deterministic ws_ prefix per workspace', () => {
    expect(composioEntityId('abc-123')).toBe('ws_abc-123');
    expect(composioEntityId('abc-123')).toBe(composioEntityId('abc-123'));
  });
});
