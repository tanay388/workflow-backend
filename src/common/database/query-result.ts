/** TypeORM returns `[rows, rowCount]` for UPDATE/DELETE; plain rows for SELECT. */
export function queryResultRows<T extends Record<string, unknown>>(
  result: unknown,
): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }
  if (Array.isArray(result)) {
    return result as T[];
  }
  return [];
}

/** Row count from TypeORM UPDATE/DELETE result tuple. */
export function queryResultAffected(result: unknown): number {
  if (Array.isArray(result) && typeof result[1] === 'number') {
    return result[1];
  }
  return 0;
}
