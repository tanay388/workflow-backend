import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';

export type WorkflowTriggerEvent = 'completed' | 'failed';

@Entity('workflow_triggers')
@Index('idx_workflow_triggers_source', ['sourceWorkflowId', 'event'], {
  where: "deleted_at IS NULL AND is_active = true",
})
export class WorkflowTriggerLink extends BaseEntity {
  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'uuid', name: 'source_workflow_id' })
  sourceWorkflowId: string;

  @Column({ type: 'uuid', name: 'target_workflow_id' })
  targetWorkflowId: string;

  @Column({ type: 'varchar', length: 32 })
  event: WorkflowTriggerEvent;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;
}
