import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { AppConfigService } from './common/config/config.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TenancyContextService } from './common/tenancy/tenancy-context.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(AppConfigService);

  // Open an AsyncLocalStorage tenancy scope for every request (TRD §3).
  // Phase 01: empty scope; Phase 02/03 populate it from the JWT via a guard.
  const tenancy = app.get(TenancyContextService);
  app.use((_req: Request, _res: Response, next: NextFunction) => tenancy.run({}, () => next()));

  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // Graceful SIGTERM/SIGINT: stop accepting work, close the DB pool, flush logs.
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Growy v2 API')
    .setDescription('Multi-tenant AI workflow automation API')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(config.port);
}

bootstrap().catch((error) => {
  // Logger isn't available if boot fails this early.
  console.error('Failed to start API', error);
  process.exit(1);
});
