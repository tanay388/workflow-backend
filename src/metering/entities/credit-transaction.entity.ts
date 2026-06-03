import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum CreditTransactionType {
  SIGNUP_GRANT = 'signup_grant',
  TOPUP = 'topup',
  DEBIT = 'debit',
  ADJUSTMENT = 'adjustment',
}

@Entity('credit_transactions')
export class CreditTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'numeric', precision: 12, scale: 4, name: 'amount_usd' })
  amountUsd: string;

  @Column({ type: 'enum', enum: CreditTransactionType, enumName: 'credit_transaction_type' })
  type: CreditTransactionType;

  @Column({ type: 'numeric', precision: 12, scale: 4, name: 'balance_after' })
  balanceAfter: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', name: 'actor_type', length: 32, nullable: true })
  actorType: string | null;

  @Column({ type: 'uuid', name: 'actor_id', nullable: true })
  actorId: string | null;

  @Column({ type: 'uuid', name: 'run_id', nullable: true })
  runId: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
