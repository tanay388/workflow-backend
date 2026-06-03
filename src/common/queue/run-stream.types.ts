import type { RunEvent } from './run-event-bus.interface';

/** Postgres NOTIFY channel for a single run (TRD §6.5). */
export function runExecChannel(runId: string): string {
  return `exec_${runId}`;
}

/** LISTEN requires quoted identifiers when the channel contains hyphens (UUIDs). */
export function runExecListenSql(channel: string): string {
  const safe = channel.replace(/"/g, '');
  return `LISTEN "${safe}"`;
}

export type RunStreamReplayPayload = {
  type: 'replay';
  run: {
    id: string;
    status: string;
    workflowId: string;
    triggerSource: string;
    error: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  };
  steps: Array<{
    id: string;
    nodeId: string;
    nodeType: string;
    nodeLabel: string;
    status: string;
    seq: number;
    error: string | null;
  }>;
};

export type RunStreamLivePayload = {
  type: 'event';
  event: RunEvent;
};

export type RunStreamTerminalPayload = {
  type: 'terminal';
  status: string;
};

export type RunStreamPayload =
  | RunStreamReplayPayload
  | RunStreamLivePayload
  | RunStreamTerminalPayload;

const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'canceled']);

export function isTerminalRunStatus(status: string): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

/**
 * Only forward NOTIFY events that matter for live observability.
 * Token deltas (Phase 13) and other noisy kinds are excluded.
 */
export function isStreamObservableEvent(event: RunEvent): boolean {
  if (event.kind === 'token') return false;
  if (event.kind === 'run') return true;
  if (event.kind === 'step') {
    const phase = event.phase as string | undefined;
    return phase === 'start' || phase === 'end';
  }
  return false;
}

export function stepDedupeKey(event: RunEvent): string | null {
  if (event.kind !== 'step') return null;
  const nodeId = String(event.nodeId ?? '');
  const seq = String(event.seq ?? '');
  const phase = String(event.phase ?? '');
  return `${nodeId}:${seq}:${phase}`;
}
