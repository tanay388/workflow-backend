import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigService } from '../config/config.service';
import { HttpLoggingInterceptor } from './http-logging.interceptor';

/**
 * Structured logging via pino, wired as the Nest logger (TRD §15).
 * Pretty single-line output in dev; JSON in production. Auth/cookie headers
 * are redacted. Per-request lines are emitted by {@link HttpLoggingInterceptor}
 * (route + durationMs; body + error only on failures).
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => ({
        pinoHttp: {
          level: cfg.logLevel,
          autoLogging: false,
          /** Avoid merging full req (headers, etc.) into app logs from PinoLogger. */
          quietReqLogger: true,
          transport: cfg.isProduction
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  translateTime: 'SYS:standard',
                  ignore: 'pid,hostname,context,req,res',
                },
              },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
  ],
  providers: [
    HttpLoggingInterceptor,
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
  ],
  exports: [LoggerModule, HttpLoggingInterceptor],
})
export class LoggingModule {}
