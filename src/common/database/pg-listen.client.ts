import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Client } from 'pg';
import { AppConfigService } from '../config/config.service';
import { pgClientConfig } from './pg-client.config';

/**
 * Owns dedicated pg connections for LISTEN/NOTIFY (outside the request pool).
 * Each SSE subscriber acquires one client and must release it on disconnect.
 */
@Injectable()
export class PgListenClient implements OnModuleDestroy {
  private readonly logger = new Logger(PgListenClient.name);
  private readonly active = new Set<Client>();

  constructor(private readonly cfg: AppConfigService) {}

  async acquire(): Promise<Client> {
    const client = new Client(pgClientConfig(this.cfg.database));
    await client.connect();
    this.active.add(client);
    return client;
  }

  async release(client: Client): Promise<void> {
    try {
      await client.query('UNLISTEN *');
    } catch {
      // connection may already be closed
    }
    try {
      await client.end();
    } catch (err) {
      this.logger.debug(`pg listen client end: ${String(err)}`);
    }
    this.active.delete(client);
  }

  async onModuleDestroy(): Promise<void> {
    const clients = [...this.active];
    await Promise.all(clients.map((c) => this.release(c)));
  }
}
