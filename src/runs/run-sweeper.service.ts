import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../common/config/config.service';
import { PgRunQueue } from './pg-run-queue.service';

/** Reclaims stalled runs only — time-based pause sweep lives in SchedulerTickService (Phase 11). */
@Injectable()
export class RunSweeperService {
  constructor(
    private readonly cfg: AppConfigService,
    private readonly queue: PgRunQueue,
  ) {}

  async sweep(): Promise<void> {
    const staleBefore = new Date(Date.now() - this.cfg.worker.stalledMinutes * 60_000);
    await this.queue.reclaimStalled(staleBefore);
  }
}
