import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';

export enum OrgStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

@Entity('organizations')
export class Organization extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  slug: string;

  @Column({ type: 'uuid', name: 'plan_id', nullable: true })
  planId: string | null;

  @Column({ type: 'int', name: 'concurrency_limit', default: 5 })
  concurrencyLimit: number;

  @Column({ type: 'bigint', name: 'monthly_token_quota', nullable: true })
  monthlyTokenQuota: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 4, name: 'price_per_million_usd', nullable: true })
  pricePerMillionUsd: string | null;

  @Column({ type: 'bigint', name: 'daily_token_cap', nullable: true })
  dailyTokenCap: string | null;

  @Column({ type: 'jsonb', name: 'alert_thresholds', nullable: true })
  alertThresholds: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 32, default: OrgStatus.ACTIVE })
  status: OrgStatus;
}
