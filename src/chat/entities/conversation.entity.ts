import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';

export type ConversationSource = 'builder_test' | 'widget' | 'api';
export type ConversationStatus = 'open' | 'closed';

@Entity('conversations')
@Index('idx_conversations_workspace_last_message', ['workspaceId', 'lastMessageAt'])
export class Conversation extends BaseEntity {
  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @Column({ type: 'uuid', name: 'workflow_id' })
  workflowId: string;

  @Column({ type: 'varchar', length: 32, default: 'builder_test' })
  source: ConversationSource;

  @Column({ type: 'varchar', length: 32, default: 'open' })
  status: ConversationStatus;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId: string | null;

  @Column({ type: 'uuid', name: 'visitor_id', nullable: true })
  visitorId: string | null;

  @Column({ type: 'text', nullable: true })
  title: string | null;

  @Column({ type: 'timestamptz', name: 'last_message_at', nullable: true })
  lastMessageAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  memory: Record<string, unknown> | null;
}
