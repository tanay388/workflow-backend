/** Shallow match filter for wait-event bindings (exact string equality per key). */
export function matchesEventFilter(
  match: Record<string, unknown> | undefined,
  payload: Record<string, unknown>,
): boolean {
  if (!match || Object.keys(match).length === 0) return true;
  for (const [key, expected] of Object.entries(match)) {
    const actual = getNestedValue(payload, key);
    if (String(actual ?? '') !== String(expected ?? '')) return false;
  }
  return true;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
