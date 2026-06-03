import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';

export type FormFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'select'
  | 'checkbox'
  | 'date'
  | 'long-text';

export interface FormFieldSchema {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
}

export type FormStatus = 'draft' | 'published';

@Entity('forms')
@Index(['workflowId', 'status'])
export class Form extends BaseEntity {
  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @Column({ type: 'uuid', name: 'workflow_id' })
  workflowId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: FormStatus;

  @Column({ type: 'jsonb', default: [] })
  schema: FormFieldSchema[];

  @Column({ type: 'uuid', name: 'bound_widget_id', nullable: true })
  boundWidgetId: string | null;
}
