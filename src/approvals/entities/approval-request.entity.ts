import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

@Entity('approval_requests')
@Index('idx_approval_requests_org_status', ['orgId', 'status'])
export class ApprovalRequest extends BaseEntity {
  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @Column({ type: 'uuid', name: 'run_id' })
  runId: string;

  @Column({ type: 'text', name: 'node_id' })
  nodeId: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'jsonb', default: {} })
  context: Record<string, unknown>;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status: ApprovalStatus;

  @Column({ type: 'uuid', name: 'decided_by', nullable: true })
  decidedBy: string | null;

  @Column({ type: 'timestamptz', name: 'decided_at', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'text', name: 'action_token', unique: true })
  actionToken: string;

  @Column({ type: 'timestamptz', name: 'token_expires_at' })
  tokenExpiresAt: Date;

  @Column({ type: 'timestamptz', name: 'consumed_at', nullable: true })
  consumedAt: Date | null;
}
