/**
 * Coerce any value to a display string. Used widely by node executors and
 * logging to render inputs/outputs without throwing on objects/circular refs.
 */
export function toText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return safeStringify(value);
}

/** JSON.stringify that never throws (handles circular references). */
export function safeStringify(value: unknown, space?: number): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (_key, val: unknown) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]';
          seen.add(val);
        }
        return typeof val === 'bigint' ? val.toString() : val;
      },
      space,
    );
  } catch {
    return String(value);
  }
}

/** URL-safe slug from a human-readable name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
