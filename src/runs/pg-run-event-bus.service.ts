import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { AppConfigService } from '../common/config/config.service';
import { pgClientConfig } from '../common/database/pg-client.config';
import {
  RUN_EVENT_BUS,
  type RunEvent,
  type RunEventBus,
} from '../common/queue/run-event-bus.interface';
import { runExecChannel, runExecListenSql } from '../common/queue/run-stream.types';

export { RUN_EVENT_BUS };

@Injectable()
export class PgRunEventBus implements RunEventBus, OnModuleDestroy {
  private listenClient: Client | null = null;
  private readonly handlers = new Map<string, Set<(event: RunEvent) => void>>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cfg: AppConfigService,
  ) {}

  async publish(runId: string, event: RunEvent): Promise<void> {
    const channel = runExecChannel(runId);
    const payload = JSON.stringify(event);
    await this.dataSource.query(`SELECT pg_notify($1, $2)`, [channel, payload]);
  }

  async subscribe(runId: string, handler: (event: RunEvent) => void): Promise<() => void> {
    const client = await this.ensureListenClient();
    const channel = runExecChannel(runId);

    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
      await client.query(runExecListenSql(channel));
    }
    this.handlers.get(channel)!.add(handler);

    const onNotify = (msg: { channel?: string; payload?: string }) => {
      if (msg.channel !== channel || !msg.payload) return;
      try {
        handler(JSON.parse(msg.payload) as RunEvent);
      } catch {
        // ignore malformed payloads
      }
    };
    client.on('notification', onNotify);

    return () => {
      this.handlers.get(channel)?.delete(handler);
      client.removeListener('notification', onNotify);
    };
  }

  private async ensureListenClient(): Promise<Client> {
    if (this.listenClient) return this.listenClient;
    const client = new Client(pgClientConfig(this.cfg.database));
    await client.connect();
    this.listenClient = client;
    return client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.listenClient?.end();
    this.listenClient = null;
  }
}
