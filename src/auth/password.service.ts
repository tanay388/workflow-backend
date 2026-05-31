import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AppConfigService } from '../common/config/config.service';

/** Argon2id password hashing — the only module that calls argon2 (Phase 02). */
@Injectable()
export class PasswordService {
  constructor(private readonly config: AppConfigService) {}

  async hash(plaintext: string): Promise<string> {
    const { memoryCost, timeCost, parallelism } = this.config.argon2;
    return argon2.hash(plaintext, {
      type: argon2.argon2id,
      memoryCost,
      timeCost,
      parallelism,
    });
  }

  async verify(hash: string, plaintext: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plaintext);
    } catch {
      return false;
    }
  }
}
