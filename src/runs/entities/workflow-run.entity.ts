import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type RunStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'canceled';

export type RunTriggerSource =
  | 'manual'
  | 'api'
  | 'scheduler'
  | 'external_event'
  | 'inbound_webhook'
  | 'workflow_completed'
  | 'platform_event'
  | 'chat'
  | 'widget';

export type WaitMode = 'time_based' | 'trigger_based';

@Entity('workflow_runs')
@Index('idx_workflow_runs_status_org_created', ['status', 'orgId', 'createdAt'])
@Index('idx_workflow_runs_workflow_created', ['workflowId', 'createdAt'])
export class WorkflowRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @Column({ type: 'uuid', name: 'workflow_id' })
  workflowId: string;

  @Column({ type: 'uuid', name: 'workflow_version_id' })
  workflowVersionId: string;

  @Column({ type: 'varchar', length: 32, default: 'queued' })
  status: RunStatus;

  @Column({ type: 'varchar', length: 32, name: 'trigger_source', default: 'manual' })
  triggerSource: RunTriggerSource;

  @Column({ type: 'jsonb', name: 'run_by', nullable: true })
  runBy: Record<string, unknown> | null;

  @Column({ type: 'uuid', name: 'conversation_id', nullable: true })
  conversationId: string | null;

  @Column({ type: 'uuid', name: 'message_id', nullable: true })
  messageId: string | null;

  @Column({ type: 'jsonb', name: 'trigger_metadata', nullable: true })
  triggerMetadata: Record<string, unknown> | null;

  @Column({ type: 'jsonb', default: {} })
  input: unknown;

  @Column({ type: 'jsonb', nullable: true })
  output: unknown;

  @Column({ type: 'jsonb', name: 'resume_state', nullable: true })
  resumeState: Record<string, unknown> | null;

  @Column({ type: 'text', name: 'last_completed_node_id', nullable: true })
  lastCompletedNodeId: string | null;

  @Column({ type: 'timestamptz', name: 'resume_at', nullable: true })
  resumeAt: Date | null;

  @Column({ type: 'varchar', length: 32, name: 'wait_mode', nullable: true })
  waitMode: WaitMode | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'int', name: 'max_attempts', default: 3 })
  maxAttempts: number;

  @Column({ type: 'text', name: 'locked_by', nullable: true })
  lockedBy: string | null;

  @Column({ type: 'timestamptz', name: 'locked_at', nullable: true })
  lockedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'bigint', name: 'total_input_tokens', default: 0 })
  totalInputTokens: string;

  @Column({ type: 'bigint', name: 'total_output_tokens', default: 0 })
  totalOutputTokens: string;

  @Column({ type: 'numeric', precision: 12, scale: 6, name: 'total_cost_usd', default: 0 })
  totalCostUsd: string;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'finished_at', nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
