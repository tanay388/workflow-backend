import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from '../config/config.service';
import { AuditSubscriber } from './audit.subscriber';
import { PgListenClient } from './pg-listen.client';

/**
 * The single TypeORM connection for the process (TRD §1, §3.1, §15) —
 * EXACTLY ONE pool. `synchronize=false` always; schema changes go through
 * migrations only. Feature modules register entities via
 * `TypeOrmModule.forFeature(...)` (autoLoadEntities picks them up).
 *
 * No other module may construct a `DataSource` (lint-enforced).
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => ({
        type: 'postgres',
        url: cfg.database.url,
        ssl: cfg.database.ssl ? { rejectUnauthorized: false } : false,
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
        // One pool per process.
        extra: { max: 10 },
      }),
    }),
  ],
  providers: [AuditSubscriber, PgListenClient],
  exports: [TypeOrmModule, PgListenClient],
})
export class DatabaseModule {}
