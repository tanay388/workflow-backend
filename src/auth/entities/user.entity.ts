import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';

/** Tenant user identity (TRD §4.1). Tenancy claims are wired in Phase 03. */
@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar', name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'timestamptz', name: 'email_verified_at', nullable: true })
  emailVerifiedAt: Date | null;
}
