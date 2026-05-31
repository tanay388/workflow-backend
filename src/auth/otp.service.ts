import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AppConfigService } from '../common/config/config.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { EmailService } from '../common/email/email.service';
import { EmailOtp, EmailOtpPurpose } from './entities/email-otp.entity';

@Injectable()
export class OtpService {
  constructor(
    private readonly config: AppConfigService,
    private readonly crypto: CryptoService,
    private readonly email: EmailService,
    @InjectRepository(EmailOtp)
    private readonly otpRepo: Repository<EmailOtp>,
  ) {}

  /** Generate a 6-digit OTP, store its hash, and email it. */
  async createAndSend(userId: string, email: string, name: string): Promise<void> {
    const code = this.generateCode();
    await this.store(userId, code);
    await this.email.sendTemplate({
      to: email,
      subject: 'Verify your Growy account',
      template: 'otp',
      context: { name, code, ttlMinutes: this.config.otp.ttlMinutes },
    });
  }

  async verify(userId: string, code: string, purpose = EmailOtpPurpose.SIGNUP_VERIFY): Promise<void> {
    const row = await this.otpRepo.findOne({
      where: { userId, purpose, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!row) throw new Error('OTP_NOT_FOUND');
    if (row.expiresAt <= new Date()) throw new Error('OTP_EXPIRED');
    if (row.attempts >= this.config.otp.maxAttempts) throw new Error('OTP_MAX_ATTEMPTS');

    const codeHash = this.crypto.hashSha256(`${userId}:${code}`);
    if (codeHash !== row.codeHash) {
      row.attempts += 1;
      await this.otpRepo.save(row);
      throw new Error('OTP_INVALID');
    }

    row.consumedAt = new Date();
    await this.otpRepo.save(row);
  }

  private async store(userId: string, code: string): Promise<void> {
    const expiresAt = new Date(Date.now() + this.config.otp.ttlMinutes * 60_000);
    const codeHash = this.crypto.hashSha256(`${userId}:${code}`);
    await this.otpRepo.save(
      this.otpRepo.create({
        userId,
        codeHash,
        purpose: EmailOtpPurpose.SIGNUP_VERIFY,
        expiresAt,
        consumedAt: null,
        attempts: 0,
      }),
    );
  }

  private generateCode(): string {
    const n = globalThis.crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
    return n.toString().padStart(6, '0');
  }
}
