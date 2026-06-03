/**
 * Match request Origin or Referer against a widget's allowed_domains list.
 * Supports exact host and subdomain suffix (e.g. *.example.com via ".example.com").
 */

export function extractRequestOrigin(
  originHeader?: string,
  refererHeader?: string,
): string | null {
  if (originHeader?.trim()) {
    try {
      return new URL(originHeader.trim()).origin;
    } catch {
      return null;
    }
  }
  if (refererHeader?.trim()) {
    try {
      return new URL(refererHeader.trim()).origin;
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeAllowedDomain(entry: string): string | null {
  const raw = entry.trim().toLowerCase();
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      return new URL(raw).host;
    } catch {
      return null;
    }
  }
  return raw.replace(/\/+$/, '').split('/')[0] ?? null;
}

export function originHost(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export interface OriginAllowOptions {
  /** Accept any browser origin (embed on arbitrary sites). */
  allowAllOrigins?: boolean;
  /** Also accept full origins from server CORS_ORIGINS (e.g. http://localhost:3000). */
  corsOrigins?: string[];
}

function isCorsOriginListed(requestOrigin: string, corsOrigins: string[]): boolean {
  for (const entry of corsOrigins) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    try {
      const allowed =
        trimmed.includes('://') ? new URL(trimmed).origin : `https://${trimmed}`;
      if (requestOrigin === new URL(allowed).origin) return true;
    } catch {
      // ignore malformed entry
    }
  }
  return false;
}

/** True when the request origin/referer is allowed for this widget. */
export function isOriginAllowed(
  allowedDomains: string[],
  originHeader?: string,
  refererHeader?: string,
  options?: OriginAllowOptions,
): boolean {
  const origin = extractRequestOrigin(originHeader, refererHeader);
  if (!origin) return false;

  if (options?.allowAllOrigins) return true;

  if (options?.corsOrigins?.length && isCorsOriginListed(origin, options.corsOrigins)) {
    return true;
  }

  if (!allowedDomains.length) return false;

  const host = originHost(origin);
  if (!host) return false;

  for (const entry of allowedDomains) {
    const allowed = normalizeAllowedDomain(entry);
    if (!allowed) continue;

    if (allowed.startsWith('.')) {
      const suffix = allowed.slice(1);
      if (host === suffix || host.endsWith(allowed)) return true;
      continue;
    }

    if (host === allowed) return true;

    try {
      const allowedOrigin = allowed.includes('://')
        ? new URL(allowed).origin
        : `https://${allowed}`;
      if (origin === new URL(allowedOrigin).origin) return true;
    } catch {
      // ignore malformed entry
    }
  }

  return false;
}
