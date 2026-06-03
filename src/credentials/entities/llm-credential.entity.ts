import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';
import { LlmProvider } from '../../common/llm/llm.types';

export type LlmCredentialStatus = 'valid' | 'invalid' | 'unchecked';

@Entity('llm_credentials')
@Index(['orgId', 'provider'], { unique: true })
export class LlmCredential extends BaseEntity {
  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'enum', enum: LlmProvider, enumName: 'llm_provider' })
  provider: LlmProvider;

  @Column({ type: 'bytea', name: 'encrypted_key' })
  encryptedKey: Buffer;

  @Column({ type: 'varchar', length: 32, name: 'key_fingerprint' })
  keyFingerprint: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  label: string | null;

  @Column({ type: 'text', name: 'base_url', nullable: true })
  baseUrl: string | null;

  @Column({ type: 'varchar', length: 32, default: 'unchecked' })
  status: LlmCredentialStatus;
}
