/**
 * Timezone / cron helpers — the single DST-safe surface (TRD §7, §19).
 *
 * SIGNATURES ONLY in Phase 01. Phase 11 (Scheduler) implements these with a
 * tested IANA-tz + cron library and unit tests across DST boundaries; Phase 10
 * (Wait `until_datetime`) reuses the exact same code. Do not inline ad-hoc
 * `Date` math elsewhere.
 */

const NOT_IMPLEMENTED = 'time util not implemented until Phase 11 (Scheduler)';

/** Parse a compact duration (`15m`, `30d`, `3600s`, `2h`) to milliseconds. */
export function parseDurationToMs(input: string): number {
  const match = /^(\d+)([smhd])$/.exec(input.trim());
  if (!match) throw new Error(`Invalid duration: ${input}`);
  const n = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return n * multipliers[unit]!;
}

/** Resolve a local 'HH:MM' in an IANA tz to the UTC 'HH:MM' for a given date. */
export function localTimeToUtcHHMM(_localHHMM: string, _tz: string, _onDate: Date): string {
  throw new Error(NOT_IMPLEMENTED);
}

/** Next firing instant for a schedule, after a reference instant. */
export function nextRunAt(_schedule: unknown, _fromInstant: Date): Date {
  throw new Error(NOT_IMPLEMENTED);
}

/** Whether a schedule is due in the minute containing `nowUtc`. */
export function isDueThisMinute(_schedule: unknown, _nowUtc: Date): boolean {
  throw new Error(NOT_IMPLEMENTED);
}

/** Next instant matching a cron expression in a given tz, after `from`. */
export function cronNextAfter(_expr: string, _tz: string, _from: Date): Date {
  throw new Error(NOT_IMPLEMENTED);
}
