import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Client } from 'pg';
import { AppConfigService } from '../common/config/config.service';
import { pgClientConfig } from '../common/database/pg-client.config';
import {
  formatDbError,
  isTransientDbError,
} from '../common/database/transient-db-error';
import { PgRunQueue } from './pg-run-queue.service';

@Injectable()
export class RunEnqueueListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunEnqueueListener.name);
  private client: Client | null = null;
  private onWake: (() => void) | null = null;

  constructor(
    private readonly cfg: AppConfigService,
    private readonly queue: PgRunQueue,
  ) {}

  setWakeHandler(fn: () => void): void {
    this.onWake = fn;
  }

  async onModuleInit(): Promise<void> {
    if (!this.cfg.worker.enabled) return;
    this.client = new Client(pgClientConfig(this.cfg.database));
    await this.client.connect();
    await this.client.query('LISTEN run_enqueued');
    this.client.on('notification', () => {
      this.onWake?.();
    });
    this.client.on('error', (err) => {
      const detail = formatDbError(err);
      if (isTransientDbError(err)) {
        this.logger.warn(`run_enqueued listener connection error: ${detail}`);
      } else {
        this.logger.error(`run_enqueued listener connection error: ${detail}`);
      }
    });
    this.logger.log('Listening on run_enqueued');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.end();
    this.client = null;
  }
}
