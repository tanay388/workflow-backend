export type WaitMode = 'delay' | 'until_datetime' | 'until_event' | 'until_approval';

export type WaitOutcome = 'continue' | 'rejected' | 'timed_out';

export type WaitConfigMode =
  | 'delay'
  | 'until_datetime'
  | 'until_event'
  | 'until_approval'
  | 'duration'
  | 'until_time'
  | 'trigger_based'
  | 'manual';

export interface WaitPauseState {
  nodeId: string;
  mode: WaitConfigMode;
  approvalId?: string;
}

export interface WaitResumeState {
  nodeId: string;
  port: WaitOutcome;
  data?: unknown;
}

/** Normalize legacy editor config modes to TRD §6.7 modes. */
export function normalizeWaitMode(raw: string | undefined): WaitMode {
  switch (raw) {
    case 'delay':
    case 'duration':
      return 'delay';
    case 'until_datetime':
    case 'until_time':
      return 'until_datetime';
    case 'until_event':
    case 'trigger_based':
      return 'until_event';
    case 'until_approval':
    case 'manual':
      return 'until_approval';
    default:
      return 'delay';
  }
}

export function outcomeToPort(outcome: WaitOutcome): string {
  return outcome;
}
