import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';

export type KnowledgeFileStatus = 'uploading' | 'indexed' | 'failed';

@Entity('knowledge_files')
@Index('idx_knowledge_files_kb', ['kbId'])
export class KnowledgeFile extends BaseEntity {
  @Column({ type: 'uuid', name: 'kb_id' })
  kbId: string;

  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'varchar', length: 512 })
  filename: string;

  @Column({ type: 'text', name: 'storage_key', nullable: true })
  storageKey: string | null;

  @Column({ type: 'text', name: 'openai_file_id', nullable: true })
  openaiFileId: string | null;

  @Column({ type: 'varchar', length: 32, default: 'uploading' })
  status: KnowledgeFileStatus;

  @Column({ type: 'bigint', default: 0 })
  bytes: string;
}
