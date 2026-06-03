import { BadRequestException, type ExecutionContext, Logger } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { HttpLoggingInterceptor } from './http-logging.interceptor';

describe('HttpLoggingInterceptor', () => {
  const interceptor = new HttpLoggingInterceptor();
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const mockContext = (path: string, body?: unknown): ExecutionContext =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          originalUrl: path,
          body,
        }),
        getResponse: () => ({ statusCode: 201 }),
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs success with durationMs and no body', async () => {
    await firstValueFrom(
      interceptor.intercept(mockContext('/workflows/1/triggers'), { handle: () => of(null) }),
    );
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toMatch(/^POST \/workflows\/1\/triggers 201 \d+ms$/);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs errors with redacted body', async () => {
    await expect(
      firstValueFrom(
        interceptor.intercept(mockContext('/auth/login', { email: 'a@b.c', password: 'secret' }), {
          handle: () => throwError(() => new BadRequestException('Invalid')),
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const msg = String(errorSpy.mock.calls[0][0]);
    expect(msg).toContain('password":"[Redacted]"');
    expect(msg).toContain('Invalid');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('skips health checks', async () => {
    await firstValueFrom(
      interceptor.intercept(mockContext('/health'), { handle: () => of(null) }),
    );
    expect(logSpy).not.toHaveBeenCalled();
  });
});
