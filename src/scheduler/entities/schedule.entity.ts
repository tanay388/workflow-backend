import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';
import type { ScheduleRepeat, ScheduleStatus } from '../schedule.types';

@Entity('schedules')
export class Schedule extends BaseEntity {
  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @Column({ type: 'uuid', name: 'workflow_id' })
  workflowId: string;

  @Column({ type: 'text', default: 'UTC' })
  timezone: string;

  @Column({ type: 'text', name: 'run_at_utc' })
  runAtUtc: string;

  @Column({ type: 'varchar', length: 32, default: 'daily' })
  repeat: ScheduleRepeat;

  @Column({ type: 'text', name: 'cron_expr', nullable: true })
  cronExpr: string | null;

  @Column({ type: 'int', name: 'days_of_week', array: true, nullable: true })
  daysOfWeek: number[] | null;

  @Column({ type: 'date', name: 'start_date' })
  startDate: string;

  @Column({ type: 'date', name: 'ends_on', nullable: true })
  endsOn: string | null;

  @Column({ type: 'jsonb', nullable: true })
  input: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status: ScheduleStatus;

  @Column({ type: 'text', name: 'last_run_key', nullable: true })
  lastRunKey: string | null;

  @Column({ type: 'timestamptz', name: 'last_run_at', nullable: true })
  lastRunAt: Date | null;
}
