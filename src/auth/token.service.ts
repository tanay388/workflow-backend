import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AppConfigService } from '../common/config/config.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { parseDurationToMs } from '../common/utils/time';
import { randomToken } from '../common/utils/ids';
import { RefreshToken } from './entities/refresh-token.entity';
import type { AuthTokens, AuthUser, JwtPayload } from './types/auth.types';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly crypto: CryptoService,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
  ) {}

  signAccessToken(
    user: AuthUser,
    tenancy?: { orgId?: string | null; workspaceId?: string | null; role?: string | null },
  ): string {
    const payload: JwtPayload = {
      sub: user.id,
      org_id: tenancy?.orgId ?? null,
      workspace_id: tenancy?.workspaceId ?? null,
      role: tenancy?.role ?? null,
    };
    return this.jwt.sign(payload);
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.jwt.verify<JwtPayload>(token);
  }

  async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomToken(32);
    const tokenHash = this.crypto.hashSha256(raw);
    const expiresAt = new Date(
      Date.now() + parseDurationToMs(this.config.jwt.refreshExpiresIn),
    );
    await this.refreshRepo.save(
      this.refreshRepo.create({ userId, tokenHash, expiresAt, revokedAt: null }),
    );
    return raw;
  }

  async rotateRefreshToken(
    rawToken: string,
  ): Promise<{ userId: string; refreshToken: string }> {
    const tokenHash = this.crypto.hashSha256(rawToken);
    const row = await this.refreshRepo.findOne({ where: { tokenHash } });
    if (!row || row.revokedAt || row.expiresAt <= new Date()) {
      throw new Error('INVALID_REFRESH');
    }
    row.revokedAt = new Date();
    await this.refreshRepo.save(row);
    const refreshToken = await this.issueRefreshToken(row.userId);
    return { userId: row.userId, refreshToken };
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = this.crypto.hashSha256(rawToken);
    const row = await this.refreshRepo.findOne({
      where: { tokenHash, revokedAt: IsNull() },
    });
    if (!row) return;
    row.revokedAt = new Date();
    await this.refreshRepo.save(row);
  }

  async issueTokenPair(user: AuthUser): Promise<AuthTokens> {
    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken };
  }
}
