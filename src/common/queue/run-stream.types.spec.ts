import type { RunEvent } from './run-event-bus.interface';
import { isStreamObservableEvent, stepDedupeKey } from './run-stream.types';

describe('run-stream.types', () => {
  it('allows run and step boundary events', () => {
    expect(
      isStreamObservableEvent({
        kind: 'run',
        runId: 'r1',
        status: 'running',
        ts: 1,
      }),
    ).toBe(true);
    expect(
      isStreamObservableEvent({
        kind: 'step',
        runId: 'r1',
        phase: 'start',
        status: 'running',
        ts: 1,
      }),
    ).toBe(true);
    expect(
      isStreamObservableEvent({
        kind: 'step',
        runId: 'r1',
        phase: 'end',
        status: 'completed',
        ts: 1,
      }),
    ).toBe(true);
  });

  it('rejects token and unknown kinds', () => {
    expect(
      isStreamObservableEvent({ kind: 'token', runId: 'r1', ts: 1 } as RunEvent),
    ).toBe(false);
    expect(isStreamObservableEvent({ kind: 'debug', runId: 'r1', ts: 1 } as RunEvent)).toBe(
      false,
    );
  });

  it('dedupes by node, seq, and phase', () => {
    const event = {
      kind: 'step',
      nodeId: 'n1',
      seq: 2,
      phase: 'end',
      runId: 'r1',
      ts: 1,
    } as RunEvent;
    expect(stepDedupeKey(event)).toBe('n1:2:end');
  });
});
