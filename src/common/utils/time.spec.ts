import { DateTime } from 'luxon';
import {
  inferLocalTimeHHMM,
  isDueThisMinute,
  localTimeToUtcHHMM,
  nextRunAt,
} from './time';
import type { ScheduleTiming } from '../../scheduler/schedule.types';

describe('time utils (Phase 11)', () => {
  const base: ScheduleTiming = {
    timezone: 'America/New_York',
    runAtUtc: '14:00',
    repeat: 'daily',
    startDate: '2026-01-15',
    daysOfWeek: null,
    endsOn: null,
  };

  it('localTimeToUtcHHMM differs across EST vs EDT for same local 09:00', () => {
    const winter = localTimeToUtcHHMM('09:00', 'America/New_York', new Date('2026-01-15T12:00:00Z'));
    const summer = localTimeToUtcHHMM('09:00', 'America/New_York', new Date('2026-07-15T12:00:00Z'));
    expect(winter).toBe('14:00');
    expect(summer).toBe('13:00');
  });

  it('inferLocalTimeHHMM recovers 09:00 local from winter run_at_utc', () => {
    const runAtUtc = localTimeToUtcHHMM('09:00', 'America/New_York', new Date('2026-01-15T12:00:00Z'));
    const local = inferLocalTimeHHMM(runAtUtc, 'America/New_York', '2026-01-15');
    expect(local).toBe('09:00');
  });

  it('isDueThisMinute fires at correct UTC instant in EDT', () => {
    const runAtUtc = localTimeToUtcHHMM('09:00', 'America/New_York', new Date('2026-07-15T12:00:00Z'));
    const schedule: ScheduleTiming = { ...base, runAtUtc, startDate: '2026-07-01' };
    const dueAt = DateTime.fromISO('2026-07-15T13:00:00', { zone: 'utc' }).toJSDate();
    expect(isDueThisMinute(schedule, dueAt)).toBe(true);
    const notDue = DateTime.fromISO('2026-07-15T14:00:00', { zone: 'utc' }).toJSDate();
    expect(isDueThisMinute(schedule, notDue)).toBe(false);
  });

  it('nextRunAt returns a future instant for daily schedule', () => {
    const runAtUtc = localTimeToUtcHHMM('09:00', 'America/New_York', new Date('2026-01-15T12:00:00Z'));
    const schedule: ScheduleTiming = { ...base, runAtUtc };
    const from = new Date('2026-01-15T10:00:00Z');
    const next = nextRunAt(schedule, from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });
});
