import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';

export type TriggerSubscriptionStatus = 'pending' | 'active' | 'error' | 'disabled';

@Entity('trigger_subscriptions')
@Index('idx_trigger_subscriptions_external', ['externalId'], {
  where: 'deleted_at IS NULL AND external_id IS NOT NULL',
})
export class TriggerSubscription extends BaseEntity {
  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @Column({ type: 'uuid', name: 'workflow_id' })
  workflowId: string;

  /** `composio_event` = workflow trigger; wait bindings also use this with config.run_id set. */
  @Column({ type: 'varchar', length: 64, default: 'composio_event' })
  kind: string;

  @Column({ type: 'uuid', name: 'connected_account_id', nullable: true })
  connectedAccountId: string | null;

  @Column({ type: 'text', nullable: true })
  toolkit: string | null;

  @Column({ type: 'text', name: 'event_slug', nullable: true })
  eventSlug: string | null;

  @Column({ type: 'jsonb', default: {} })
  config: Record<string, unknown>;

  @Column({ type: 'text', name: 'external_id', nullable: true })
  externalId: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  status: TriggerSubscriptionStatus | null;

  @Column({ type: 'text', name: 'user_query', nullable: true })
  userQuery: string | null;

  /** True when this row is a Phase-12 workflow trigger (not a wait-node binding). */
  isWorkflowTrigger(): boolean {
    const cfg = this.config ?? {};
    return !cfg.run_id && !cfg.node_id;
  }
}
