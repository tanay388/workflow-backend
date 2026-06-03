import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { queryResultRows } from '../common/database/query-result';
import {
  formatDbError,
  isTransientDbError,
} from '../common/database/transient-db-error';
import { AppConfigService } from '../common/config/config.service';
import { WaitService } from '../approvals/wait.service';
import { ScheduleClaimService } from './schedule-claim.service';
import { SchedulesService } from './schedules.service';

/** Postgres advisory lock id for single-poller scheduler (TRD §7). */
const SCHEDULER_ADVISORY_LOCK_KEY = 110_011;

@Injectable()
export class SchedulerTickService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerTickService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private shuttingDown = false;

  constructor(
    private readonly cfg: AppConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly schedules: SchedulesService,
    private readonly claim: ScheduleClaimService,
    private readonly wait: WaitService,
  ) {}

  onModuleInit(): void {
    if (!this.cfg.worker.enabled) return;
    const interval = this.cfg.scheduler.tickIntervalMs;
    this.timer = setInterval(() => void this.tick(), interval);
    void this.tick();
    this.logger.log(`Scheduler tick started (interval=${interval}ms)`);
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.ticking || this.shuttingDown) return;
    this.ticking = true;
    let locked = false;
    try {
      locked = await this.tryAdvisoryLock();
      if (!locked) return;

      if (!this.shuttingDown) {
        const active = await this.schedules.findActiveSchedules();
        const fired = await this.claim.claimAndEnqueue(active);
        if (fired.length > 0) {
          this.logger.debug(`Scheduler enqueued ${fired.length} run(s)`);
        }
      }

      await this.wait.processDuePauses();
    } catch (err) {
      const detail = formatDbError(err);
      if (isTransientDbError(err)) {
        this.logger.warn(
          `Scheduler tick skipped (database temporarily unavailable): ${detail}`,
        );
      } else {
        this.logger.error(`Scheduler tick failed: ${detail}`);
      }
    } finally {
      if (locked) await this.releaseAdvisoryLock();
      this.ticking = false;
    }
  }

  private async tryAdvisoryLock(): Promise<boolean> {
    const rows = queryResultRows<{ locked: boolean }>(
      await this.dataSource.query(`SELECT pg_try_advisory_lock($1) AS locked`, [
        SCHEDULER_ADVISORY_LOCK_KEY,
      ]),
    );
    return Boolean(rows[0]?.locked);
  }

  private async releaseAdvisoryLock(): Promise<void> {
    await this.dataSource.query(`SELECT pg_advisory_unlock($1)`, [
      SCHEDULER_ADVISORY_LOCK_KEY,
    ]);
  }
}
