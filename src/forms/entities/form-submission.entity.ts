import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('form_submissions')
@Index(['formId', 'createdAt'])
export class FormSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'form_id' })
  formId: string;

  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'uuid', name: 'conversation_id', nullable: true })
  conversationId: string | null;

  @Column({ type: 'uuid', name: 'visitor_id', nullable: true })
  visitorId: string | null;

  @Column({ type: 'jsonb', default: {} })
  data: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
