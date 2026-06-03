/** Network / pool errors that are safe to retry on the next background tick. */
const TRANSIENT_ERRNO = new Set([
  'EADDRNOTAVAIL',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

/** Postgres connection / availability errors (SQLSTATE). */
const TRANSIENT_PG_CODES = new Set([
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '53300', // too_many_connections
]);

const TRANSIENT_MESSAGE_FRAGMENTS = [
  'eaddrnotavail',
  'connection terminated',
  'connection reset',
  'connection refused',
  'timeout expired',
  'socket hang up',
  'network is unreachable',
  'getaddrinfo',
];

function errorRecord(err: unknown): Record<string, unknown> | null {
  return err && typeof err === 'object' ? (err as Record<string, unknown>) : null;
}

function readCode(err: unknown): string | undefined {
  const top = errorRecord(err);
  if (!top) return undefined;
  if (typeof top.code === 'string') return top.code;
  const driver = errorRecord(top.driverError);
  if (driver && typeof driver.code === 'string') return driver.code;
  return undefined;
}

function readMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  const top = errorRecord(err);
  if (top && typeof top.message === 'string') return top.message;
  return String(err);
}

/** True when the failure is likely temporary (network blip, DB restart, pool exhaustion). */
export function isTransientDbError(err: unknown): boolean {
  const code = readCode(err);
  if (code) {
    if (TRANSIENT_ERRNO.has(code) || TRANSIENT_PG_CODES.has(code)) return true;
  }

  const lower = readMessage(err).toLowerCase();
  return TRANSIENT_MESSAGE_FRAGMENTS.some((frag) => lower.includes(frag));
}

export function formatDbError(err: unknown): string {
  const code = readCode(err);
  const message = readMessage(err);
  return code ? `${message} (${code})` : message;
}
