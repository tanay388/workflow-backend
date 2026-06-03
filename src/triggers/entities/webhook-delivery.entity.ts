import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('webhook_deliveries')
@Index(['orgId', 'idempotencyKey'], { unique: true })
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'text', name: 'idempotency_key' })
  idempotencyKey: string;

  @Column({ type: 'text' })
  source: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'received_at' })
  receivedAt: Date;

  @Column({ type: 'uuid', name: 'run_id', nullable: true })
  runId: string | null;
}
