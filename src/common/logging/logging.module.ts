import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigService } from '../config/config.service';

/**
 * Structured logging via pino, wired as the Nest logger (TRD §15).
 * Pretty single-line output in dev; JSON in production. Auth/cookie headers
 * are redacted. AppConfigService resolves globally (AppConfigModule is @Global).
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => ({
        pinoHttp: {
          level: cfg.logLevel,
          autoLogging: !cfg.isTest,
          transport: cfg.isProduction
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:standard' },
              },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
