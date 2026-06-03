export type ScheduleRepeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'cron';

export type ScheduleStatus = 'active' | 'paused' | 'archived';

/** Shape used by time helpers (entity + DTO). */
export interface ScheduleTiming {
  timezone: string;
  runAtUtc: string;
  repeat: ScheduleRepeat;
  cronExpr?: string | null;
  daysOfWeek?: number[] | null;
  startDate: string;
  endsOn?: string | null;
  lastRunAt?: Date | null;
  lastRunKey?: string | null;
}
