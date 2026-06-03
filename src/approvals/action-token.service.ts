import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AppConfigService } from '../common/config/config.service';
import { CryptoService } from '../common/crypto/crypto.service';

export interface VerifiedActionToken {
  approvalId: string;
}

@Injectable()
export class ActionTokenService {
  constructor(
    private readonly crypto: CryptoService,
    private readonly cfg: AppConfigService,
  ) {}

  mint(approvalId: string): string {
    const nonce = randomBytes(16).toString('hex');
    const payload = `${approvalId}.${nonce}`;
    const sig = this.crypto.hmacSha256(payload, this.secret()).slice(0, 32);
    return Buffer.from(`${payload}.${sig}`).toString('base64url');
  }

  verify(token: string): VerifiedActionToken | null {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf8');
      const parts = decoded.split('.');
      if (parts.length !== 3) return null;
      const [approvalId, nonce, sig] = parts;
      if (!approvalId || !nonce || !sig) return null;
      const payload = `${approvalId}.${nonce}`;
      const expected = this.crypto.hmacSha256(payload, this.secret()).slice(0, 32);
      if (!this.crypto.safeEqualHex(sig, expected)) return null;
      return { approvalId };
    } catch {
      return null;
    }
  }

  shareUrl(token: string): string {
    return `${this.cfg.frontendUrl}/a/${token}`;
  }

  private secret(): string {
    return this.cfg.jwt.secret;
  }
}
