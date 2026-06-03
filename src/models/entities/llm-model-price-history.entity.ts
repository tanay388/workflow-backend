import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LlmModel } from './llm-model.entity';

@Entity('llm_model_price_history')
@Index(['modelId', 'effectiveFrom'])
export class LlmModelPriceHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'model_id' })
  modelId: string;

  @ManyToOne(() => LlmModel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'model_id' })
  model: LlmModel;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 4,
    name: 'input_price_per_million_usd',
  })
  inputPricePerMillionUsd: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 4,
    name: 'output_price_per_million_usd',
  })
  outputPricePerMillionUsd: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'effective_from' })
  effectiveFrom: Date;

  @Column({ type: 'uuid', name: 'changed_by', nullable: true })
  changedBy: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;
}
