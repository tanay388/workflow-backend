/** Shallow copy of upstream node outputs for passthrough fields (avoids circular JSON). */
export function snapshotOutputs(outputs: Record<string, unknown>): Record<string, unknown> {
  return { ...outputs };
}

/** Break passthrough → live outputs bag cycles before persisting node output. */
export function sanitizeNodeOutput(
  data: unknown,
  liveOutputs: Record<string, unknown>,
): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const record = data as Record<string, unknown>;
  if (record.passthrough === liveOutputs) {
    const passthrough: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(liveOutputs)) {
      // Exclude the in-flight node output that closes the passthrough circle.
      if (value !== data) passthrough[key] = value;
    }
    return { ...record, passthrough };
  }
  return data;
}
