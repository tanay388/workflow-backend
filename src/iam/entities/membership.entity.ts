import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../common/database/base.entity';
import { MemberRole } from '../../common/rbac/roles';
import { User } from '../../auth/entities/user.entity';
import { Organization } from './organization.entity';

export enum MembershipStatus {
  ACTIVE = 'active',
  INVITED = 'invited',
  DISABLED = 'disabled',
}

@Entity('memberships')
@Unique(['userId', 'orgId'])
export class Membership extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Index()
  @Column({ type: 'uuid', name: 'org_id' })
  orgId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'org_id' })
  org: Organization;

  @Column({ type: 'varchar', length: 32 })
  role: MemberRole;

  @Column({ type: 'varchar', length: 32, default: MembershipStatus.ACTIVE })
  status: MembershipStatus;

  @Column({ type: 'varchar', name: 'invited_email', length: 320, nullable: true })
  invitedEmail: string | null;
}
