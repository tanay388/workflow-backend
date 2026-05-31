import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { AppConfigService } from '../common/config/config.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { EmailService } from '../common/email/email.service';
import { EmailOtp, EmailOtpPurpose } from './entities/email-otp.entity';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  let service: OtpService;
  let otpRepo: jest.Mocked<Pick<Repository<EmailOtp>, 'save' | 'create' | 'findOne'>>;
  let email: { sendTemplate: jest.Mock };

  beforeEach(async () => {
    otpRepo = {
      save: jest.fn(async (row) => row as EmailOtp),
      create: jest.fn((row) => row as EmailOtp),
      findOne: jest.fn(),
    };
    email = { sendTemplate: jest.fn(async () => ({ delivered: false, html: '' })) };

    const module = await Test.createTestingModule({
      providers: [
        OtpService,
        {
          provide: AppConfigService,
          useValue: { otp: { ttlMinutes: 10, maxAttempts: 3 } },
        },
        {
          provide: CryptoService,
          useValue: { hashSha256: (v: string) => `hash:${v}` },
        },
        { provide: EmailService, useValue: email },
        { provide: getRepositoryToken(EmailOtp), useValue: otpRepo },
      ],
    }).compile();

    service = module.get(OtpService);
  });

  it('stores a hashed OTP and sends email', async () => {
    await service.createAndSend('user-1', 'a@b.com', 'Alex');
    expect(otpRepo.save).toHaveBeenCalled();
    expect(email.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'otp', to: 'a@b.com' }),
    );
  });

  it('consumes a valid OTP once', async () => {
    otpRepo.findOne.mockResolvedValueOnce({
      id: 'otp-1',
      userId: 'user-1',
      codeHash: 'hash:user-1:123456',
      purpose: EmailOtpPurpose.SIGNUP_VERIFY,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      attempts: 0,
    } as EmailOtp);

    await service.verify('user-1', '123456');
    expect(otpRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ consumedAt: expect.any(Date) }),
    );
  });

  it('rejects expired OTP', async () => {
    otpRepo.findOne.mockResolvedValueOnce({
      id: 'otp-1',
      userId: 'user-1',
      codeHash: 'hash:user-1:123456',
      purpose: EmailOtpPurpose.SIGNUP_VERIFY,
      expiresAt: new Date(Date.now() - 1),
      consumedAt: null,
      attempts: 0,
    } as EmailOtp);

    await expect(service.verify('user-1', '123456')).rejects.toThrow('OTP_EXPIRED');
  });
});
