import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';
import { LlmProvider } from '../../common/llm/llm.types';

@Entity('llm_models')
@Index(['provider', 'modelKey'], { unique: true })
export class LlmModel extends BaseEntity {
  @Column({ type: 'enum', enum: LlmProvider, enumName: 'llm_provider' })
  provider: LlmProvider;

  @Column({ type: 'varchar', length: 255, name: 'model_key' })
  modelKey: string;

  @Column({ type: 'varchar', length: 255, name: 'display_name' })
  displayName: string;

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

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;
}
