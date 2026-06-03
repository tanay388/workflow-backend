import { Injectable, Logger } from '@nestjs/common';
import {
  formatDbError,
  isTransientDbError,
} from '../common/database/transient-db-error';
import { AlertSweepService } from '../metering/alert-sweep.service';
import { RunExecutorService } from './run-executor.service';
import { PgRunQueue } from './pg-run-queue.service';
import { RunEnqueueListener } from './run-enqueue-listener.service';
import { RunSweeperService } from './run-sweeper.service';
import { AppConfigService } from '../common/config/config.service';

@Injectable()
export class RunDispatcherService {
  private readonly logger = new Logger(RunDispatcherService.name);
  private timer: NodeJS.Timeout | null = null;
  private dispatching = false;
  private active = 0;

  constructor(
    private readonly cfg: AppConfigService,
    private readonly queue: PgRunQueue,
    private readonly executor: RunExecutorService,
    private readonly sweeper: RunSweeperService,
    private readonly listener: RunEnqueueListener,
    private readonly alertSweep: AlertSweepService,
  ) {}

  private alertSweepCounter = 0;

  start(): void {
    if (!this.cfg.worker.enabled) {
      this.logger.log('Worker disabled (WORKER_ENABLED=false)');
      return;
    }
    this.listener.setWakeHandler(() => void this.tick());
    const interval = this.cfg.worker.dispatchIntervalMs;
    this.timer = setInterval(() => void this.tick(), interval);
    void this.tick();
    this.logger.log(`Dispatcher started (interval=${interval}ms)`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      await this.sweeper.sweep();
      this.alertSweepCounter++;
      if (this.alertSweepCounter % 20 === 0) {
        void this.alertSweep.sweep().catch((err) =>
          this.logger.warn(`Alert sweep failed: ${err}`),
        );
      }
      const pool = this.cfg.worker.executorPoolSize;
      const free = Math.max(0, pool - this.active);
      if (free === 0) return;

      const claimed = await this.queue.claimRunnable(Math.min(free, this.cfg.worker.dispatchBatch));
      for (const runId of claimed) {
        this.active++;
        void this.executor
          .executeRun(runId)
          .catch((err) => this.logger.error(`Run ${runId} failed: ${err}`))
          .finally(() => {
            this.active--;
          });
      }
    } catch (err) {
      this.logTickFailure(err);
    } finally {
      this.dispatching = false;
    }
  }

  private logTickFailure(err: unknown): void {
    const detail = formatDbError(err);
    if (isTransientDbError(err)) {
      this.logger.warn(
        `Dispatcher tick skipped (database temporarily unavailable): ${detail}`,
      );
      return;
    }
    this.logger.error(`Dispatcher tick failed: ${detail}`);
  }
}
