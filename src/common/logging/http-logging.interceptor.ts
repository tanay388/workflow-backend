import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

const SKIP_PATH_PREFIXES = ['/health', '/ready', '/docs'];

const SENSITIVE_KEY_RE =
  /password|secret|token|authorization|api[_-]?key|refresh|credential/i;

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      out[key] = '[Redacted]';
    } else {
      out[key] = redactValue(val);
    }
  }
  return out;
}

function requestPath(req: Request): string {
  return req.originalUrl?.split('?')[0] ?? req.url?.split('?')[0] ?? '';
}

function shouldSkip(path: string): boolean {
  return SKIP_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

function formatError(exception: unknown): unknown {
  if (exception instanceof HttpException) {
    return exception.getResponse();
  }
  if (exception instanceof Error) {
    return { message: exception.message, name: exception.name };
  }
  return { message: String(exception) };
}

/**
 * Logs every HTTP request: method, path, status, durationMs.
 * Request body and error payload are included only when the handler throws.
 */
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  /** Nest Logger — avoids pino-http attaching full `req` (headers) to each line. */
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const path = requestPath(req);

    if (shouldSkip(path)) {
      return next.handle();
    }

    const method = req.method;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - start;
        const status = res.statusCode;
        this.logger.log(`${method} ${path} ${status} ${durationMs}ms`);
      }),
      catchError((exception: unknown) => {
        const durationMs = Date.now() - start;
        const status =
          exception instanceof HttpException ? exception.getStatus() : res.statusCode || 500;

        const body =
          req.body !== undefined &&
          req.body !== null &&
          !(typeof req.body === 'object' && Object.keys(req.body as object).length === 0)
            ? redactValue(req.body)
            : undefined;

        const detail = JSON.stringify({
          method,
          path,
          status,
          durationMs,
          ...(body !== undefined ? { body } : {}),
          error: formatError(exception),
        });
        this.logger.error(`${method} ${path} ${status} ${durationMs}ms ${detail}`);

        return throwError(() => exception);
      }),
    );
  }
}
