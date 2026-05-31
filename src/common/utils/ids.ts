/**
 * ID generation. Uses the global Web Crypto API (Node 19+) so this stays
 * outside the `node:crypto` ban — CryptoModule owns `node:crypto`, not id-gen.
 */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** A URL-safe random token (e.g. webhook path tokens, visitor tokens). */
export function randomToken(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}
