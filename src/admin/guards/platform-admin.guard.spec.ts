import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PlatformAdminRole } from '../entities/platform-admin.entity';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformStepUpService } from '../platform-step-up.service';

describe('PlatformAdminGuard step-up', () => {
  const reflector = new Reflector();
  const jwt = { verify: jest.fn() } as unknown as JwtService;
  const config = { jwt: { platformSecret: 'secret' } } as never;
  const adminAuth = {
    getById: jest.fn().mockResolvedValue({
      id: 'a1',
      email: 'admin@test.com',
      name: 'Admin',
      role: PlatformAdminRole.SUPERADMIN,
    }),
  } as never;
  const stepUp = {
    consumeConfirmToken: jest.fn(),
  } as unknown as PlatformStepUpService;

  const guard = new PlatformAdminGuard(reflector, jwt, config, adminAuth, stepUp);

  function context(meta: Record<string, boolean>, headers: Record<string, string> = {}) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer token', ...headers },
        }),
      }),
    } as never;
  }

  beforeEach(() => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
      if (key === 'platformRoute') return true;
      if (key === 'platformWrite') return true;
      if (key === 'platformStepUp') return true;
      return false;
    });
    (jwt.verify as jest.Mock).mockReturnValue({ sub: 'a1', aud: 'platform' });
    (stepUp.consumeConfirmToken as jest.Mock).mockReset();
  });

  it('rejects missing confirm token on step-up routes', async () => {
    (stepUp.consumeConfirmToken as jest.Mock).mockReturnValue(false);
    await expect(guard.canActivate(context({}))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows valid confirm token', async () => {
    (stepUp.consumeConfirmToken as jest.Mock).mockReturnValue(true);
    await expect(
      guard.canActivate(context({}, { 'x-confirm-token': 'confirm-1' })),
    ).resolves.toBe(true);
  });

  it('blocks support role on write routes', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
      if (key === 'platformRoute') return true;
      if (key === 'platformWrite') return true;
      if (key === 'platformStepUp') return false;
      return false;
    });
    (adminAuth.getById as jest.Mock).mockResolvedValue({
      id: 's1',
      role: PlatformAdminRole.SUPPORT,
    });
    await expect(guard.canActivate(context({}))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
