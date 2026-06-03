import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type RunStepStatus = 'running' | 'completed' | 'failed' | 'paused';

@Entity('run_steps')
@Index('idx_run_steps_run_seq', ['runId', 'seq'])
export class RunStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'run_id' })
  runId: string;

  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'text', name: 'node_id' })
  nodeId: string;

  @Column({ type: 'text', name: 'node_type' })
  nodeType: string;

  @Column({ type: 'text', name: 'node_label' })
  nodeLabel: string;

  @Column({ type: 'varchar', length: 32, default: 'running' })
  status: RunStepStatus;

  @Column({ type: 'jsonb', nullable: true })
  input: unknown;

  @Column({ type: 'jsonb', nullable: true })
  output: unknown;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', name: 'input_tokens', default: 0 })
  inputTokens: number;

  @Column({ type: 'int', name: 'output_tokens', default: 0 })
  outputTokens: number;

  @Column({ type: 'text', nullable: true })
  model: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 6, name: 'cost_usd', default: 0 })
  costUsd: string;

  @Column({ type: 'timestamptz', name: 'started_at', default: () => 'now()' })
  startedAt: Date;

  @Column({ type: 'timestamptz', name: 'ended_at', nullable: true })
  endedAt: Date | null;

  @Column({ type: 'int' })
  seq: number;
}
