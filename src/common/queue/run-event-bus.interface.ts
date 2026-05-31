/**
 * RunEventBus contract (TRD §16, §6.5). Phase 06 ships the Postgres
 * `LISTEN/NOTIFY` implementation on channel `exec_<runId>`; a Redis pub/sub
 * implementation can replace it later behind the same interface. Phase 01
 * defines the contract + DI token ONLY — no implementation is bound.
 *
 * Canonical envelope (TRD §6.5): identifiers + small deltas only (~8KB cap);
 * clients fetch full detail from `run_steps` / `GET /runs/:id`.
 */
export type RunEventKind = 'step' | 'token' | 'run';

export interface RunEvent {
  kind: RunEventKind;
  runId: string;
  ts: number;
  [key: string]: unknown;
}

export interface RunEventBus {
  publish(runId: string, event: RunEvent): Promise<void>;
  /** Subscribe to a run's channel; resolves to an unsubscribe function. */
  subscribe(runId: string, handler: (event: RunEvent) => void): Promise<() => void>;
}

/** DI token — bound to a Postgres LISTEN/NOTIFY implementation in Phase 06. */
export const RUN_EVENT_BUS = Symbol('RUN_EVENT_BUS');
