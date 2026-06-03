import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type MessageStatus = 'streaming' | 'complete' | 'failed';

@Entity('conversation_messages')
@Index('idx_conversation_messages_conv_seq', ['conversationId', 'seq'], { unique: true })
export class ConversationMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'conversation_id' })
  conversationId: string;

  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'varchar', length: 16 })
  role: MessageRole;

  @Column({ type: 'text', default: '' })
  content: string;

  @Column({ type: 'varchar', length: 16, default: 'complete' })
  status: MessageStatus;

  @Column({ type: 'uuid', name: 'run_id', nullable: true })
  runId: string | null;

  @Column({ type: 'int', name: 'input_tokens', nullable: true })
  inputTokens: number | null;

  @Column({ type: 'int', name: 'output_tokens', nullable: true })
  outputTokens: number | null;

  @Column({ type: 'text', nullable: true })
  model: string | null;

  @Column({ type: 'int' })
  seq: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
