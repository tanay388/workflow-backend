/** Exponential backoff for retry attempts (TRD §6.6). Returns delay in ms. */
export function backoffMs(attempts: number): number {
  const base = 30_000;
  const cap = 15 * 60_000;
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempts - 1));
  const jitter = Math.floor(Math.random() * 0.2 * exp);
  return exp + jitter;
}

export function backoffResumeAt(attempts: number, from = new Date()): Date {
  return new Date(from.getTime() + backoffMs(attempts));
}
