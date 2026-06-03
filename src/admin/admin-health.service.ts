import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertSweepService } from '../metering/alert-sweep.service';
import { WorkflowRun } from '../runs/entities/workflow-run.entity';

const STUCK_RUN_MINUTES = 30;

@Injectable()
export class AdminHealthService {
  constructor(
    @InjectRepository(WorkflowRun) private readonly runs: Repository<WorkflowRun>,
    private readonly alertSweep: AlertSweepService,
  ) {}

  async getHealth() {
    const queued = await this.runs.count({ where: { status: 'queued' } });

    const failed = await this.runs.count({ where: { status: 'failed' } });

    const stuckCutoff = new Date(Date.now() - STUCK_RUN_MINUTES * 60 * 1000);
    const stuck = await this.runs
      .createQueryBuilder('r')
      .where('r.status = :status', { status: 'running' })
      .andWhere('r.locked_at IS NOT NULL')
      .andWhere('r.locked_at < :cutoff', { cutoff: stuckCutoff })
      .getCount();

    return {
      queueDepth: queued,
      failedRuns: failed,
      stuckRuns: stuck,
      alertSweepLastRunAt: this.alertSweep.getLastSweepAt()?.toISOString() ?? null,
    };
  }
}
