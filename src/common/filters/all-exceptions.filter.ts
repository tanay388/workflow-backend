import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * Global exception filter producing a consistent error envelope the frontend
 * API client unwraps (TRD §3.2 — shared error handling). 5xx errors are logged
 * with a stack; client errors are returned as-is.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status: number =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const { error, message } = this.normalize(exception, status);

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const envelope: ErrorEnvelope = {
      statusCode: status,
      error,
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    };
    res.status(status).json(envelope);
  }

  private normalize(
    exception: unknown,
    status: number,
  ): { error: string; message: string | string[] } {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') return { error: exception.name, message: body };
      const obj = body as { error?: string; message?: string | string[] };
      return {
        error: obj.error ?? exception.name,
        message: obj.message ?? exception.message,
      };
    }
    return { error: HttpStatus[status] ?? 'Error', message: 'Internal server error' };
  }
}
