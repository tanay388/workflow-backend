import type { NextFunction, Request, Response } from 'express';

/**
 * Reflect the request Origin on /public/widget/* so embed pages (e.g. localhost:8080)
 * are not blocked by the global CORS_ORIGINS allowlist. Per-widget origin policy
 * is still enforced in PublicWidgetService.
 */
export function widgetPublicCorsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const path = req.url?.split('?')[0] ?? '';
  if (!path.startsWith('/public/widget')) {
    next();
    return;
  }

  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.trim()) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-Visitor-Token',
      );
      res.setHeader('Access-Control-Max-Age', '86400');
      res.status(204).end();
      return;
    }
  }

  next();
}
