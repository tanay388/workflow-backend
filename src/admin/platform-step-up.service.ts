import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { PasswordService } from '../auth/password.service';
import { PlatformAdmin } from './entities/platform-admin.entity';

const CONFIRM_TTL_MS = 5 * 60 * 1000;

interface ConfirmRow {
  adminId: string;
  expiresAt: number;
}

@Injectable()
export class PlatformStepUpService {
  private readonly tokens = new Map<string, ConfirmRow>();

  constructor(
    @InjectRepository(PlatformAdmin) private readonly admins: Repository<PlatformAdmin>,
    private readonly passwords: PasswordService,
  ) {}

  async issueConfirmToken(adminId: string, password: string): Promise<string> {
    const admin = await this.admins.findOne({ where: { id: adminId } });
    if (!admin || !(await this.passwords.verify(admin.passwordHash, password))) {
      throw new UnauthorizedException('Invalid password');
    }

    this.pruneExpired();
    const token = randomUUID();
    this.tokens.set(token, { adminId, expiresAt: Date.now() + CONFIRM_TTL_MS });
    return token;
  }

  stepUpResponse(adminId: string, password: string) {
    return this.issueConfirmToken(adminId, password).then((confirmToken) => ({
      confirmToken,
      expiresInSeconds: CONFIRM_TTL_MS / 1000,
    }));
  }

  consumeConfirmToken(adminId: string, token: string | undefined): boolean {
    if (!token) return false;
    this.pruneExpired();
    const row = this.tokens.get(token);
    if (!row || row.adminId !== adminId || Date.now() > row.expiresAt) {
      return false;
    }
    this.tokens.delete(token);
    return true;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, row] of this.tokens) {
      if (row.expiresAt <= now) this.tokens.delete(key);
    }
  }
}
