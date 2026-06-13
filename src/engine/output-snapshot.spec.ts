import { sanitizeNodeOutput, snapshotOutputs } from './output-snapshot';

describe('output-snapshot', () => {
  it('snapshotOutputs returns a shallow copy', () => {
    const live = { Start: { ok: true } };
    const copy = snapshotOutputs(live);
    expect(copy).toEqual(live);
    expect(copy).not.toBe(live);
  });

  it('sanitizeNodeOutput breaks passthrough cycles', () => {
    const live: Record<string, unknown> = { Start: { ok: true } };
    const data = { branch: 'true', passthrough: live };
    live['If / Else'] = data;

    const sanitized = sanitizeNodeOutput(data, live) as Record<string, unknown>;
    expect(() => JSON.stringify(sanitized)).not.toThrow();
    expect(sanitized.passthrough).not.toBe(live);
    expect(sanitized.passthrough).toEqual({ Start: { ok: true } });
  });
});
