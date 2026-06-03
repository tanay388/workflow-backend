import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';
import { Organization } from '../../iam/entities/organization.entity';
import { Workspace } from '../../iam/entities/workspace.entity';
import { WorkflowVersion } from './workflow-version.entity';

export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

@Entity('workflows')
export class Workflow extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Index()
  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'org_id' })
  org: Organization;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 32, default: WorkflowStatus.DRAFT })
  status: WorkflowStatus;

  @Column({ type: 'uuid', name: 'current_version_id', nullable: true })
  currentVersionId: string | null;

  @ManyToOne(() => WorkflowVersion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'current_version_id' })
  currentVersion: WorkflowVersion | null;
}
