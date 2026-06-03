import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';

@Entity('knowledge_bases')
@Index('idx_knowledge_bases_workspace', ['workspaceId'])
export class KnowledgeBase extends BaseEntity {
  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', name: 'openai_vector_store_id' })
  openaiVectorStoreId: string;

  @Column({ type: 'boolean', default: false })
  byok: boolean;

  @Column({ type: 'int', name: 'file_count', default: 0 })
  fileCount: number;
}
