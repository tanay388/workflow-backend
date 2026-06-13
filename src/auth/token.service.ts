import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AppConfigService } from '../common/config/config.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { parseDurationToMs } from '../common/utils/time';
import { randomToken } from '../common/utils/ids';
import { RefreshToken } from './entities/refresh-token.entity';
import type { AuthTokens, AuthUser, JwtPayload } from './types/auth.types';

/** The presented refresh token is unknown, expired, or revoked beyond grace. */
export class InvalidRefreshTokenError extends Error {
  constructor() {
    super('INVALID_REFRESH');
    this.name = 'InvalidRefreshTokenError';
  }
}

/**
 * A token rotated away this recently still resolves to its successor instead
 * of failing — tolerates page reloads that interrupt a refresh response and
 * parallel tabs racing the same token.
 */
const ROTATION_GRACE_MS = 60_000;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly crypto: CryptoService,
    @InjectDataSource() private readonly dataSource: DataSource,
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
      aud: 'tenant',
    };
    return this.jwt.sign(payload);
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.jwt.verify<JwtPayload>(token);
  }

  async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomToken(32);
    const tokenHash = this.crypto.hashSha256(raw);
    const expiresAt = new Date(Date.now() + parseDurationToMs(this.config.jwt.refreshExpiresIn));
    await this.refreshRepo.save(
      this.refreshRepo.create({ userId, tokenHash, expiresAt, revokedAt: null }),
    );
    return raw;
  }

  async rotateRefreshToken(rawToken: string): Promise<{ userId: string; refreshToken: string }> {
    const tokenHash = this.crypto.hashSha256(rawToken);
    const rotated = await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(RefreshToken);
      // FOR UPDATE: concurrent rotations of the same token serialize here, so
      // the loser sees the committed revocation and takes the grace path
      // instead of forking a second token chain.
      const row = await repo.findOne({
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new InvalidRefreshTokenError();

      if (row.revokedAt) {
        return this.resolveGraceSuccessor(repo, row);
      }
      if (row.expiresAt <= new Date()) throw new InvalidRefreshTokenError();

      const raw = randomToken(32);
      const expiresAt = new Date(Date.now() + parseDurationToMs(this.config.jwt.refreshExpiresIn));
      const successor = await repo.save(
        repo.create({
          userId: row.userId,
          tokenHash: this.crypto.hashSha256(raw),
          expiresAt,
          revokedAt: null,
        }),
      );

      row.revokedAt = new Date();
      row.replacedById = successor.id ?? null;
      row.successorCipher = this.crypto.encrypt(raw, row.userId);
      await repo.save(row);

      return { userId: row.userId, refreshToken: raw };
    });

    void this.pruneUserTokens(rotated.userId).catch(() => undefined);
    return rotated;
  }

  /**
   * A revoked token presented within the grace window resolves to its live
   * successor (the response the client failed to store). Beyond grace, or if
   * the successor was itself revoked (logout) or expired, the reuse is
   * rejected.
   */
  private async resolveGraceSuccessor(
    repo: Repository<RefreshToken>,
    row: RefreshToken,
  ): Promise<{ userId: string; refreshToken: string }> {
    const revokedAgoMs = Date.now() - new Date(row.revokedAt!).getTime();
    if (revokedAgoMs > ROTATION_GRACE_MS || !row.replacedById || !row.successorCipher) {
      throw new InvalidRefreshTokenError();
    }
    const successor = await repo.findOne({ where: { id: row.replacedById } });
    if (!successor || successor.revokedAt || successor.expiresAt <= new Date()) {
      throw new InvalidRefreshTokenError();
    }
    const raw = this.crypto.decrypt(Buffer.from(row.successorCipher), row.userId);
    return { userId: row.userId, refreshToken: raw };
  }

  /** Drop expired rows and rotation breadcrumbs older than the audit horizon. */
  private async pruneUserTokens(userId: string): Promise<void> {
    await this.dataSource.query(
      `
      DELETE FROM refresh_tokens
      WHERE user_id = $1
        AND (expires_at < now() OR revoked_at < now() - interval '7 days')
      `,
      [userId],
    );
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
