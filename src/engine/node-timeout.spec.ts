import type { WorkflowNode } from '../common/types/graph';
import {
  executeWithTimeout,
  NodeTimeoutError,
  resolveNodeTimeoutMs,
} from './node-timeout';

function agentNode(config: Record<string, unknown> = {}): WorkflowNode {
  return {
    id: 'n_agent',
    type: 'builtins.Agent',
    label: 'Agent',
    config,
    position: { x: 0, y: 0 },
  };
}

describe('resolveNodeTimeoutMs', () => {
  const defaults = { agentSeconds: 120, agentMaxSeconds: 600 };

  it('returns 0 for non-agent nodes', () => {
    expect(
      resolveNodeTimeoutMs(
        { ...agentNode(), type: 'builtins.Echo' },
        defaults,
      ),
    ).toBe(0);
  });

  it('uses platform default when timeout_seconds is unset', () => {
    expect(resolveNodeTimeoutMs(agentNode(), defaults)).toBe(120_000);
  });

  it('uses per-node override when set', () => {
    expect(resolveNodeTimeoutMs(agentNode({ timeout_seconds: 45 }), defaults)).toBe(
      45_000,
    );
  });

  it('caps per-node override at platform max', () => {
    expect(resolveNodeTimeoutMs(agentNode({ timeout_seconds: 900 }), defaults)).toBe(
      600_000,
    );
  });

  it('ignores invalid timeout_seconds values', () => {
    expect(resolveNodeTimeoutMs(agentNode({ timeout_seconds: -5 }), defaults)).toBe(
      120_000,
    );
    expect(resolveNodeTimeoutMs(agentNode({ timeout_seconds: 'bad' }), defaults)).toBe(
      120_000,
    );
  });
});

describe('executeWithTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves when promise completes before timeout', async () => {
    const result = await executeWithTimeout(Promise.resolve('ok'), 1000, () =>
      new NodeTimeoutError('Agent', 1000),
    );
    expect(result).toBe('ok');
  });

  it('rejects with timeout error when promise is slow', async () => {
    const slow = new Promise<string>(() => {});
    const run = executeWithTimeout(slow, 500, () => new NodeTimeoutError('Agent', 500));
    const expectPromise = expect(run).rejects.toThrow(/timed out after 1s/);
    await jest.advanceTimersByTimeAsync(500);
    await expectPromise;
  });

  it('skips timeout when timeoutMs is 0', async () => {
    const result = await executeWithTimeout(Promise.resolve(42), 0, () =>
      new Error('should not run'),
    );
    expect(result).toBe(42);
  });
});
