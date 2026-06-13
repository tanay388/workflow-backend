import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import type { DataSource, Repository } from 'typeorm';
import { AppConfigService } from '../common/config/config.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { InvalidRefreshTokenError, TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;
  let refreshRepo: jest.Mocked<Pick<Repository<RefreshToken>, 'save' | 'create' | 'findOne'>>;

  beforeEach(async () => {
    refreshRepo = {
      save: jest.fn(async (row) => row as RefreshToken),
      create: jest.fn((row) => row as RefreshToken),
      findOne: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(() => 'signed.jwt.token'),
            verify: jest.fn(() => ({
              sub: 'user-1',
              org_id: null,
              workspace_id: null,
              role: null,
            })),
          },
        },
        {
          provide: AppConfigService,
          useValue: {
            jwt: { secret: 'test-secret-min-16-ch', accessExpiresIn: '15m', refreshExpiresIn: '7d' },
          },
        },
        {
          provide: CryptoService,
          useValue: {
            hashSha256: (v: string) => `hash:${v}`,
            encrypt: (v: string) => Buffer.from(`enc:${v}`),
            decrypt: (b: Buffer) => b.toString('utf8').replace(/^enc:/, ''),
          },
        },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshRepo },
        {
          provide: getDataSourceToken(),
          useValue: {
            transaction: async (fn: (em: { getRepository: () => typeof refreshRepo }) => unknown) =>
              fn({ getRepository: () => refreshRepo }),
            query: jest.fn(async () => []),
          } as Pick<DataSource, 'transaction' | 'query'>,
        },
      ],
    }).compile();

    service = module.get(TokenService);
  });

  it('signs access JWT with placeholder tenancy claims', () => {
    const token = service.signAccessToken({
      id: 'user-1',
      email: 'a@b.com',
      name: 'A',
      emailVerifiedAt: new Date(),
    });
    const payload = service.verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.org_id).toBeNull();
    expect(payload.workspace_id).toBeNull();
    expect(payload.role).toBeNull();
  });

  it('rotates refresh tokens and revokes the old row', async () => {
    const oldRaw = 'old-refresh-token-value-1234567890';
    refreshRepo.findOne.mockResolvedValueOnce({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: 'hash:old-refresh-token-value-1234567890',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    } as RefreshToken);

    const result = await service.rotateRefreshToken(oldRaw);
    expect(result.userId).toBe('user-1');
    expect(result.refreshToken).toBeTruthy();
    expect(refreshRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        revokedAt: expect.any(Date),
        successorCipher: expect.any(Buffer),
      }),
    );
  });

  it('returns the same successor when a rotated token is replayed within grace', async () => {
    refreshRepo.findOne
      .mockResolvedValueOnce({
        id: 'rt-old',
        userId: 'user-1',
        tokenHash: 'hash:old',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(Date.now() - 5_000),
        replacedById: 'rt-new',
        successorCipher: Buffer.from('enc:successor-raw'),
      } as RefreshToken)
      .mockResolvedValueOnce({
        id: 'rt-new',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      } as RefreshToken);

    const result = await service.rotateRefreshToken('old');
    expect(result).toEqual({ userId: 'user-1', refreshToken: 'successor-raw' });
    // Grace replay must not mint another token chain.
    expect(refreshRepo.create).not.toHaveBeenCalled();
  });

  it('rejects a revoked token beyond the grace window', async () => {
    refreshRepo.findOne.mockResolvedValueOnce({
      id: 'rt-old',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(Date.now() - 120_000),
      replacedById: 'rt-new',
      successorCipher: Buffer.from('enc:successor-raw'),
    } as RefreshToken);

    await expect(service.rotateRefreshToken('old')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('rejects grace replay once the successor was revoked (logout closes the chain)', async () => {
    refreshRepo.findOne
      .mockResolvedValueOnce({
        id: 'rt-old',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(Date.now() - 5_000),
        replacedById: 'rt-new',
        successorCipher: Buffer.from('enc:successor-raw'),
      } as RefreshToken)
      .mockResolvedValueOnce({
        id: 'rt-new',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
      } as RefreshToken);

    await expect(service.rotateRefreshToken('old')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('rejects unknown refresh tokens', async () => {
    refreshRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.rotateRefreshToken('nope')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });
});
