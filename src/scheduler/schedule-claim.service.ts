import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { queryResultAffected } from '../common/database/query-result';
import { isDueThisMinute, utcMinuteKey } from '../common/utils/time';
import { OrgStatus, Organization } from '../iam/entities/organization.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import type { WorkflowGraph } from '../common/types/graph';
import { validateRunInput } from '../common/utils/run-input';
import { RUN_QUEUE, type RunQueue } from '../common/queue/run-queue.interface';
import { WorkflowVersion } from '../workflows/entities/workflow-version.entity';
import { Schedule } from './entities/schedule.entity';
import type { ScheduleTiming } from './schedule.types';

export interface ClaimedScheduleFire {
  schedule: Schedule;
  minuteKey: string;
}

@Injectable()
export class ScheduleClaimService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(RUN_QUEUE) private readonly runQueue: RunQueue,
  ) {}

  findDue(schedules: Schedule[], nowUtc = new Date()): Schedule[] {
    return schedules.filter((s) => {
      if (s.repeat === 'none' && s.lastRunKey) return false;
      return isDueThisMinute(this.toTiming(s), nowUtc);
    });
  }

  async tryClaim(scheduleId: string, minuteKey: string): Promise<boolean> {
    const result = await this.dataSource.query(
      `
      UPDATE schedules
      SET last_run_key = $2, last_run_at = now(), updated_at = now()
      WHERE id = $1
        AND status = 'active'
        AND deleted_at IS NULL
        AND (last_run_key IS NULL OR last_run_key <> $2)
      `,
      [scheduleId, minuteKey],
    );
    return queryResultAffected(result) > 0;
  }

  async enqueueForSchedule(schedule: Schedule, label?: string): Promise<string | null> {
    const org = await this.dataSource.getRepository(Organization).findOne({
      where: { id: schedule.orgId },
    });
    if (org?.status === OrgStatus.SUSPENDED) return null;

    const wf = await this.dataSource.getRepository(Workflow).findOne({
      where: { id: schedule.workflowId },
    });
    if (!wf?.currentVersionId) return null;

    const version = await this.dataSource.getRepository(WorkflowVersion).findOne({
      where: { id: wf.currentVersionId },
    });
    const graph = version?.graph as WorkflowGraph | undefined;
    const runInput = validateRunInput(graph, schedule.input ?? {}, { mode: 'lenient' }).input;

    const { runId } = await this.runQueue.enqueue({
      orgId: schedule.orgId,
      workspaceId: schedule.workspaceId,
      workflowId: schedule.workflowId,
      workflowVersionId: wf.currentVersionId,
      triggerSource: 'scheduler',
      runBy: {
        type: 'schedule',
        id: schedule.id,
        label: label ?? `Schedule ${schedule.repeat}`,
      },
      input: runInput,
    });

    return runId;
  }

  async claimAndEnqueue(
    schedules: Schedule[],
    nowUtc = new Date(),
  ): Promise<ClaimedScheduleFire[]> {
    const minuteKey = utcMinuteKey(nowUtc);
    const due = this.findDue(schedules, nowUtc);
    const fired: ClaimedScheduleFire[] = [];

    for (const schedule of due) {
      const claimed = await this.tryClaim(schedule.id, minuteKey);
      if (!claimed) continue;
      const runId = await this.enqueueForSchedule(schedule);
      if (runId) {
        fired.push({ schedule, minuteKey });
      }
    }

    return fired;
  }

  private toTiming(row: Schedule): ScheduleTiming {
    return {
      timezone: row.timezone,
      runAtUtc: row.runAtUtc,
      repeat: row.repeat,
      cronExpr: row.cronExpr,
      daysOfWeek: row.daysOfWeek,
      startDate: row.startDate,
      endsOn: row.endsOn,
      lastRunAt: row.lastRunAt,
      lastRunKey: row.lastRunKey,
    };
  }
}
