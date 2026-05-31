import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { CryptoModule } from './crypto/crypto.module';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './email/email.module';
import { LoggingModule } from './logging/logging.module';
import { AuditModule } from './audit/audit.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { TenancyModule } from './tenancy/tenancy.module';

/**
 * Aggregates the cross-cutting infrastructure (TRD §3 `common/`): config,
 * logging, database (one pool), crypto, email, tenancy. Imported once by
 * AppModule; every feature module relies on these being available.
 */
@Global()
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    DatabaseModule,
    CryptoModule,
    EmailModule,
    TenancyModule,
    RateLimitModule,
    AuditModule,
  ],
  exports: [
    AppConfigModule,
    LoggingModule,
    DatabaseModule,
    CryptoModule,
    EmailModule,
    TenancyModule,
    RateLimitModule,
    AuditModule,
  ],
})
export class CommonModule {}
