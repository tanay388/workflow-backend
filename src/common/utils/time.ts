/**
 * Timezone / cron helpers — the single DST-safe surface (TRD §7, §19).
 */
import { CronExpressionParser } from 'cron-parser';
import { DateTime } from 'luxon';
import type { ScheduleTiming } from '../../scheduler/schedule.types';

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

export type DelayUnit = 'seconds' | 'minutes' | 'hours' | 'days';

const DELAY_UNIT_MS: Record<DelayUnit, number> = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

export function delayToResumeAt(value: number, unit: DelayUnit, from = new Date()): Date {
  const ms = value * DELAY_UNIT_MS[unit];
  return new Date(from.getTime() + ms);
}

export function localDateTimeToUtc(isoLocal: string, tz: string): Date {
  const dt = DateTime.fromISO(isoLocal.trim(), { zone: tz });
  if (!dt.isValid) {
    throw new Error(`Invalid datetime "${isoLocal}" in timezone ${tz}: ${dt.invalidReason}`);
  }
  return dt.toUTC().toJSDate();
}

function parseLocalHHMM(localHHMM: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(localHHMM.trim());
  if (!match) throw new Error(`Invalid local time (expected HH:MM): ${localHHMM}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid local time: ${localHHMM}`);
  }
  return { hour, minute };
}

/** Resolve a local 'HH:MM' in an IANA tz to the UTC 'HH:MM' for a given calendar date. */
export function localTimeToUtcHHMM(localHHMM: string, tz: string, onDate: Date): string {
  const { hour, minute } = parseLocalHHMM(localHHMM);
  const base = DateTime.fromJSDate(onDate, { zone: tz });
  const local = DateTime.fromObject(
    { year: base.year, month: base.month, day: base.day, hour, minute, second: 0 },
    { zone: tz },
  );
  if (!local.isValid) {
    throw new Error(`Invalid local time ${localHHMM} in ${tz} on ${base.toISODate()}`);
  }
  return local.toUTC().toFormat('HH:mm');
}

/** Infer fixed local wall-clock time from stored run_at_utc anchored on start_date. */
export function inferLocalTimeHHMM(
  runAtUtc: string,
  tz: string,
  anchorDate: string,
): string {
  const [uh, um] = runAtUtc.split(':').map(Number);
  const anchor = DateTime.fromISO(anchorDate, { zone: 'utc' });
  const utcDt = DateTime.utc(anchor.year, anchor.month, anchor.day, uh, um, 0);
  return utcDt.setZone(tz).toFormat('HH:mm');
}

export function utcMinuteKey(nowUtc: Date): string {
  return DateTime.fromJSDate(nowUtc, { zone: 'utc' }).toFormat('yyyyMMddHHmm');
}

function isWithinDateWindow(schedule: ScheduleTiming, nowUtc: Date): boolean {
  const zNow = DateTime.fromJSDate(nowUtc, { zone: 'utc' }).setZone(schedule.timezone);
  const start = DateTime.fromISO(schedule.startDate, { zone: schedule.timezone }).startOf('day');
  if (zNow < start) return false;
  if (schedule.endsOn) {
    const end = DateTime.fromISO(schedule.endsOn, { zone: schedule.timezone }).endOf('day');
    if (zNow > end) return false;
  }
  return true;
}

function matchesDayOfWeek(zNow: DateTime, daysOfWeek: number[] | null | undefined): boolean {
  if (!daysOfWeek?.length) return true;
  const luxonWeekday = zNow.weekday % 7;
  const jsDay = zNow.weekday === 7 ? 0 : luxonWeekday;
  return daysOfWeek.includes(jsDay) || daysOfWeek.includes(zNow.weekday);
}

function matchesUtcHHMMThisMinute(schedule: ScheduleTiming, nowUtc: Date): boolean {
  const local = inferLocalTimeHHMM(
    schedule.runAtUtc,
    schedule.timezone,
    schedule.startDate,
  );
  const zNow = DateTime.fromJSDate(nowUtc, { zone: 'utc' }).setZone(schedule.timezone);
  const expectedUtc = localTimeToUtcHHMM(local, schedule.timezone, zNow.toJSDate());
  const nowKey = DateTime.fromJSDate(nowUtc, { zone: 'utc' }).toFormat('HH:mm');
  return nowKey === expectedUtc;
}

function isCronDueThisMinute(expr: string, tz: string, nowUtc: Date): boolean {
  const zNow = DateTime.fromJSDate(nowUtc, { zone: 'utc' }).setZone(tz);
  const minuteStart = zNow.startOf('minute');
  const minuteEnd = minuteStart.plus({ minutes: 1 });
  try {
    const it = CronExpressionParser.parse(expr, {
      currentDate: minuteStart.minus({ minutes: 1 }).toJSDate(),
      tz,
    });
    const next = it.next().toDate();
    return next >= minuteStart.toJSDate() && next < minuteEnd.toJSDate();
  } catch {
    return false;
  }
}

/** Whether a schedule is due in the UTC minute containing `nowUtc`. */
export function isDueThisMinute(schedule: ScheduleTiming, nowUtc: Date): boolean {
  if (!isWithinDateWindow(schedule, nowUtc)) return false;

  const zNow = DateTime.fromJSDate(nowUtc, { zone: 'utc' }).setZone(schedule.timezone);

  if (schedule.repeat === 'cron') {
    if (!schedule.cronExpr) return false;
    return isCronDueThisMinute(schedule.cronExpr, schedule.timezone, nowUtc);
  }

  if (!matchesUtcHHMMThisMinute(schedule, nowUtc)) return false;

  if (schedule.repeat === 'none') {
    const start = DateTime.fromISO(schedule.startDate, { zone: schedule.timezone });
    return zNow.hasSame(start, 'day');
  }

  if (schedule.repeat === 'daily') return true;

  if (schedule.repeat === 'weekly') {
    return matchesDayOfWeek(zNow, schedule.daysOfWeek);
  }

  if (schedule.repeat === 'monthly') {
    const start = DateTime.fromISO(schedule.startDate, { zone: schedule.timezone });
    if (zNow.day !== start.day) return false;
    if (schedule.daysOfWeek?.length) {
      return matchesDayOfWeek(zNow, schedule.daysOfWeek);
    }
    return true;
  }

  return false;
}

/** Next firing instant for a schedule, after a reference instant. */
export function nextRunAt(schedule: ScheduleTiming, fromInstant: Date): Date {
  const from = DateTime.fromJSDate(fromInstant, { zone: 'utc' });
  const maxScanDays = schedule.repeat === 'none' ? 366 : 400;

  if (schedule.repeat === 'cron' && schedule.cronExpr) {
    try {
      const it = CronExpressionParser.parse(schedule.cronExpr, {
        currentDate: from.toJSDate(),
        tz: schedule.timezone,
      });
      return it.next().toDate();
    } catch {
      throw new Error(`Invalid cron expression: ${schedule.cronExpr}`);
    }
  }

  for (let i = 0; i < maxScanDays * 24 * 60; i++) {
    const candidate = from.plus({ minutes: i + 1 }).startOf('minute');
    if (isDueThisMinute(schedule, candidate.toJSDate())) {
      if (schedule.repeat === 'none' && schedule.lastRunKey) {
        return candidate.toJSDate();
      }
      if (schedule.repeat === 'none' && schedule.lastRunAt) {
        continue;
      }
      return candidate.toJSDate();
    }
  }

  throw new Error('Could not compute next run time within scan window');
}

/** Next instant matching a cron expression in a given tz, after `from`. */
export function cronNextAfter(expr: string, tz: string, from: Date): Date {
  const it = CronExpressionParser.parse(expr, { currentDate: from, tz });
  return it.next().toDate();
}

export function isDueThisMinuteForNoneAfterFire(schedule: ScheduleTiming): boolean {
  return schedule.repeat === 'none' && Boolean(schedule.lastRunKey);
}
