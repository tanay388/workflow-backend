/**
 * RunQueue contract (TRD §16). Phase 06 ships the Postgres implementation
 * (`workflow_runs` + `FOR UPDATE SKIP LOCKED`); a Redis/BullMQ implementation
 * can drop in later behind the same interface. Phase 01 defines the contract +
 * DI token ONLY — no implementation is bound (app boots without it).
 */
export type RunTerminalStatus = 'completed' | 'failed' | 'canceled';

export interface EnqueueRunInput {
  orgId: string;
  workspaceId: string;
  workflowId: string;
  workflowVersionId: string;
  triggerSource: string;
  runBy?: unknown;
  input?: unknown;
  conversationId?: string | null;
  messageId?: string | null;
}

export interface RunQueue {
  /** INSERT a queued run; returns its id. */
  enqueue(input: EnqueueRunInput): Promise<{ runId: string }>;
  /** Claim up to `limit` runnable runs fairly across orgs; returns claimed ids. */
  claimRunnable(limit: number): Promise<string[]>;
  markRunning(runId: string): Promise<void>;
  markPaused(runId: string, resumeAt?: Date): Promise<void>;
  markDone(runId: string, status: RunTerminalStatus, error?: string): Promise<void>;
}

/** DI token — bound to a Postgres implementation in Phase 06. */
export const RUN_QUEUE = Symbol('RUN_QUEUE');
