import { backoffMs, backoffResumeAt } from './backoff';

describe('backoff', () => {
  it('increases monotonically with attempts', () => {
    const a1 = backoffMs(1);
    const a2 = backoffMs(2);
    const a3 = backoffMs(3);
    expect(a2).toBeGreaterThanOrEqual(a1);
    expect(a3).toBeGreaterThanOrEqual(a2);
  });

  it('resume_at is in the future', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const resume = backoffResumeAt(2, now);
    expect(resume.getTime()).toBeGreaterThan(now.getTime());
  });
});
