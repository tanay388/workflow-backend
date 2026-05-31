/**
 * Token counting + cost helpers (TRD §11.5, §12).
 *
 * Phase 08 replaces {@link estimateTokens} with real per-provider usage from
 * the Agents SDK (tokenizer fallback only when a provider omits usage).
 * {@link costUsd} is already exact and used by Phase 15 metering.
 */

/**
 * Rough token estimate (~4 chars/token). TODO(P08): replace with real usage
 * reported by the model; use a tokenizer only as a fallback.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Cost in USD = total tokens × price-per-million / 1e6 (per-tenant price). */
export function costUsd(totalTokens: number, pricePerMillionUsd: number): number {
  return (totalTokens * pricePerMillionUsd) / 1_000_000;
}
