import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';

@Entity('inbound_webhooks')
@Index('idx_inbound_webhooks_workflow', ['workflowId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class InboundWebhook extends BaseEntity {
  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @Column({ type: 'uuid', name: 'workflow_id' })
  workflowId: string;

  @Column({ type: 'text', name: 'path_token', unique: true })
  pathToken: string;

  @Column({ type: 'text', name: 'signing_secret' })
  signingSecret: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;
}
