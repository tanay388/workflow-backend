import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Connection } from './entities/connection.entity';
import { ComposioService } from './composio.service';
import { ConnectionsService } from './connections.service';

const STALE_MS = 15 * 60 * 1000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class ConnectionHealthService implements OnModuleInit {
  private readonly logger = new Logger(ConnectionHealthService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Connection)
    private readonly connections: Repository<Connection>,
    private readonly composio: ComposioService,
    private readonly connectionsService: ConnectionsService,
  ) {}

  onModuleInit(): void {
    if (!this.composio.isConfigured()) return;
    this.timer = setInterval(() => {
      void this.refreshStaleBatch().catch((e) =>
        this.logger.warn(`Health refresh failed: ${e}`),
      );
    }, REFRESH_INTERVAL_MS);
  }

  async refreshIfStale(connectionId: string): Promise<void> {
    const row = await this.connections.findOne({
      where: { id: connectionId, deletedAt: IsNull() },
    });
    if (!row?.composioConnectionId) return;
    const stale =
      !row.lastCheckedAt ||
      Date.now() - row.lastCheckedAt.getTime() > STALE_MS;
    if (!stale) return;
    await this.refreshRow(row);
  }

  private async refreshStaleBatch(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_MS);
    const rows = await this.connections
      .createQueryBuilder('c')
      .where('c.deleted_at IS NULL')
      .andWhere('c.composio_connection_id IS NOT NULL')
      .andWhere('(c.last_checked_at IS NULL OR c.last_checked_at < :cutoff)', { cutoff })
      .take(50)
      .getMany();
    for (const row of rows) {
      if (!row.composioConnectionId) continue;
      await this.refreshRow(row);
    }
  }

  private async refreshRow(row: Connection): Promise<void> {
    const status = await this.composio.getConnectionStatus(row.composioConnectionId!);
    await this.connectionsService.updateStatus(row.id, status);
  }
}
