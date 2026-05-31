import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * The audit columns TRD §4 says are implied on every business table:
 * surrogate uuid pk, created/updated/deleted timestamps (soft delete), and
 * created/updated/deleted-by actor ids stamped by the {@link AuditSubscriber}.
 *
 * Abstract — not a table itself. Entities in later phases extend this.
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updatedBy: string | null;

  @Column({ type: 'uuid', name: 'deleted_by', nullable: true })
  deletedBy: string | null;
}
