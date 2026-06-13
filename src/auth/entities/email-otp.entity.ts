import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum EmailOtpPurpose {
  SIGNUP_VERIFY = 'signup_verify',
  PASSWORD_RESET = 'password_reset',
}

/** Hashed, expiring email OTP codes (Phase 02 proposal — TRD §4.1 has no OTP table). */
@Entity('email_otps')
export class EmailOtp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', name: 'code_hash', length: 64 })
  codeHash: string;

  @Column({ type: 'varchar', length: 32, default: EmailOtpPurpose.SIGNUP_VERIFY })
  purpose: EmailOtpPurpose;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', name: 'consumed_at', nullable: true })
  consumedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
