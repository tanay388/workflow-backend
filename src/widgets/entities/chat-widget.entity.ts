import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';

export interface WidgetBranding {
  name?: string;
  avatarUrl?: string;
  primaryColor?: string;
  backgroundColor?: string;
  welcomeMessage?: string;
  suggestedPrompts?: string[];
}

@Entity('chat_widgets')
@Index(['workflowId'], { unique: true, where: '"deleted_at" IS NULL' })
export class ChatWidget extends BaseEntity {
  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @Column({ type: 'uuid', name: 'workflow_id' })
  workflowId: string;

  @Column({ type: 'text', name: 'public_key', unique: true })
  publicKey: string;

  @Column({ type: 'bytea', name: 'signing_secret' })
  signingSecret: Buffer;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'text', array: true, name: 'allowed_domains', default: '{}' })
  allowedDomains: string[];

  /** When true, also accept origins listed in server CORS_ORIGINS. */
  @Column({ type: 'boolean', name: 'allow_cors_origins', default: false })
  allowCorsOrigins: boolean;

  /** When true, skip allowed_domains checks (any Origin/Referer). */
  @Column({ type: 'boolean', name: 'allow_all_origins', default: false })
  allowAllOrigins: boolean;

  @Column({ type: 'jsonb', default: {} })
  branding: WidgetBranding;

  @Column({ type: 'boolean', name: 'collect_contact', default: false })
  collectContact: boolean;

  @Column({ type: 'int', name: 'rate_limit_per_day', default: 100 })
  rateLimitPerDay: number;

  @Column({ type: 'boolean', name: 'recaptcha_enabled', default: true })
  recaptchaEnabled: boolean;
}
