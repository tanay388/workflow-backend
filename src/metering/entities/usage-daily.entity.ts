import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('usage_daily')
@Unique(['orgId', 'day'])
@Index('idx_usage_daily_org_day', ['orgId', 'day'])
export class UsageDaily {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'date' })
  day: string;

  @Column({ type: 'bigint', name: 'input_tokens', default: 0 })
  inputTokens: string;

  @Column({ type: 'bigint', name: 'output_tokens', default: 0 })
  outputTokens: string;

  @Column({ type: 'numeric', precision: 12, scale: 6, name: 'cost_usd', default: 0 })
  costUsd: string;

  @Column({ type: 'int', name: 'run_count', default: 0 })
  runCount: number;
}
