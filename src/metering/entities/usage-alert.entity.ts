import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

export enum UsageAlertScope {
  DAILY = 'daily',
  MONTHLY = 'monthly',
}

@Entity('usage_alerts')
@Unique(['orgId', 'day', 'scope', 'thresholdPct'])
@Index('idx_usage_alerts_org_day', ['orgId', 'day'])
export class UsageAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'date' })
  day: string;

  @Column({ type: 'int', name: 'threshold_pct' })
  thresholdPct: number;

  @Column({ type: 'varchar', length: 16 })
  scope: UsageAlertScope;

  @Column({ type: 'varchar', length: 32, default: 'email' })
  channel: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'sent_at' })
  sentAt: Date;
}
