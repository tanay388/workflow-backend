import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum AuditActorType {
  USER = 'user',
  PLATFORM_ADMIN = 'platform_admin',
  SYSTEM = 'system',
}

/** Semantic activity rows (TRD §4.1) — table created in Phase 01. */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'org_id', nullable: true })
  orgId: string | null;

  @Column({ type: 'uuid', name: 'actor_user_id', nullable: true })
  actorUserId: string | null;

  @Column({ type: 'varchar', name: 'actor_type', length: 32, default: AuditActorType.USER })
  actorType: AuditActorType;

  @Column({ type: 'varchar', length: 128 })
  action: string;

  @Column({ type: 'varchar', name: 'target_type', length: 128, nullable: true })
  targetType: string | null;

  @Column({ type: 'varchar', name: 'target_id', length: 128, nullable: true })
  targetId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
