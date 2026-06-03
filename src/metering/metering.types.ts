import type { MeterContext } from '../common/llm/llm.types';

export interface MeterRecordInput {
  meter: MeterContext;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  byok: boolean;
}

export interface MeteringService {
  record(input: MeterRecordInput): Promise<void>;
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
