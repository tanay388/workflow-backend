import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('chat_visitors')
@Index(['widgetId'])
export class ChatVisitor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'uuid', name: 'widget_id' })
  widgetId: string;

  @Column({ type: 'text', name: 'visitor_token', unique: true })
  visitorToken: string;

  @Column({ type: 'text', name: 'display_name', nullable: true })
  displayName: string | null;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', name: 'first_seen_at', default: () => 'now()' })
  firstSeenAt: Date;

  @Column({ type: 'timestamptz', name: 'last_seen_at', default: () => 'now()' })
  lastSeenAt: Date;
}
