import { UnauthorizedException } from '@nestjs/common';
import { PasswordService } from '../auth/password.service';
import { PlatformStepUpService } from './platform-step-up.service';

describe('PlatformStepUpService', () => {
  const admin = {
    id: 'a1',
    passwordHash: 'hash',
  };

  const admins = {
    findOne: jest.fn().mockResolvedValue(admin),
  };

  const passwords = {
    verify: jest.fn().mockResolvedValue(true),
  } as unknown as PasswordService;

  const service = new PlatformStepUpService(admins as never, passwords);

  it('issues and consumes a confirm token', async () => {
    const token = await service.issueConfirmToken('a1', 'secret');
    expect(service.consumeConfirmToken('a1', token)).toBe(true);
    expect(service.consumeConfirmToken('a1', token)).toBe(false);
  });

  it('rejects wrong password', async () => {
    (passwords.verify as jest.Mock).mockResolvedValueOnce(false);
    await expect(service.issueConfirmToken('a1', 'bad')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects token for different admin', async () => {
    const token = await service.issueConfirmToken('a1', 'secret');
    expect(service.consumeConfirmToken('other', token)).toBe(false);
  });
});
