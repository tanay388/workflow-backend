import type { MeterContext } from '../common/llm/llm.types';

export interface MeterRecordInput {
  meter: MeterContext;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  byok: boolean;
  /** 0-based index for multi-step agent loop analytics rows. */
  loopIndex?: number;
}

export interface MeterRecordLoopInput {
  meter: MeterContext;
  provider: string;
  model: string;
  byok: boolean;
  calls: Array<{ inputTokens: number; outputTokens: number }>;
}

export interface MeteringService {
  record(input: MeterRecordInput): Promise<void>;
  recordLoop(input: MeterRecordLoopInput): Promise<void>;
  rollupRunTotals(runId: string): Promise<void>;
}

export const METERING_SERVICE = Symbol('METERING_SERVICE');

export type MeterRejectReason =
  | 'org_suspended'
  | 'daily_cap_exceeded'
  | 'monthly_quota_exceeded';

export interface AlertThreshold {
  pct: number;
  channel?: string;
}
