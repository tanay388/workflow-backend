import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { LlmProvider } from '../../common/llm/llm.types';

@Entity('token_usage')
@Index('idx_token_usage_run', ['runId'])
@Index('idx_token_usage_org_created', ['orgId', 'createdAt'])
export class TokenUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @Column({ type: 'uuid', name: 'workflow_id' })
  workflowId: string;

  @Column({ type: 'uuid', name: 'run_id' })
  runId: string;

  @Column({ type: 'uuid', name: 'step_id', nullable: true })
  stepId: string | null;

  @Column({ type: 'enum', enum: LlmProvider, enumName: 'llm_provider' })
  provider: LlmProvider;

  @Column({ type: 'text' })
  model: string;

  @Column({ type: 'int', name: 'input_tokens', default: 0 })
  inputTokens: number;

  @Column({ type: 'int', name: 'output_tokens', default: 0 })
  outputTokens: number;

  @Column({ type: 'numeric', precision: 12, scale: 6, name: 'cost_usd', default: 0 })
  costUsd: string;

  @Column({ type: 'boolean', default: false })
  byok: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
