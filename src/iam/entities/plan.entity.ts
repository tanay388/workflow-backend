import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'bigint', name: 'base_monthly_quota' })
  baseMonthlyQuota: string;

  @Column({ type: 'numeric', precision: 10, scale: 4, name: 'default_price_per_million_usd' })
  defaultPricePerMillionUsd: string;

  @Column({ type: 'int', name: 'default_concurrency', default: 5 })
  defaultConcurrency: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 4,
    name: 'included_monthly_credit_usd',
    nullable: true,
  })
  includedMonthlyCreditUsd: string | null;
}
