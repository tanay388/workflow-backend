import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';

export type ConnectionStatus = 'connected' | 'expired' | 'error' | 'pending';

@Entity('connections')
@Index(['workspaceId', 'toolkit', 'name'], { unique: true })
@Index('idx_connections_workspace_toolkit', ['workspaceId', 'toolkit'])
export class Connection extends BaseEntity {
  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @Column({ type: 'text' })
  toolkit: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'boolean', name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ type: 'text', name: 'composio_connection_id', nullable: true })
  composioConnectionId: string | null;

  @Column({ type: 'text', name: 'composio_entity_id' })
  composioEntityId: string;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status: ConnectionStatus;

  @Column({ type: 'jsonb', nullable: true })
  scopes: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', name: 'last_checked_at', nullable: true })
  lastCheckedAt: Date | null;
}
