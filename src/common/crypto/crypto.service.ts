import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { AppConfigService } from '../config/config.service';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12; // GCM standard nonce length
const TAG_BYTES = 16;

/**
 * The ONLY module that touches `node:crypto` (TRD §10.3, lint-enforced).
 * AES-256-GCM authenticated encryption for secrets at rest (BYOK keys,
 * connection secrets, widget signing secrets, …).
 *
 * Ciphertext layout: `[keyIdLen:1][keyId][iv:12][authTag:16][ciphertext]`.
 * The embedded key id supports rotation — encrypt with the active key,
 * decrypt anything whose key id we still hold (decrypt-old / encrypt-new),
 * so a new key can be introduced without a big-bang re-encrypt.
 *
 * Optional `context` is bound as GCM AAD, so a ciphertext copied out of its
 * owning row (e.g. a different org) fails authentication on decrypt.
 */
@Injectable()
export class CryptoService {
  private readonly activeKeyId: string;
  private readonly keys: Map<string, Buffer>;

  constructor(config: AppConfigService) {
    const { activeKeyId, activeKey, oldKeysJson } = config.encryption;
    this.activeKeyId = activeKeyId;
    this.keys = new Map();
    this.keys.set(activeKeyId, this.decodeKey(activeKeyId, activeKey));
    for (const [id, b64] of Object.entries(this.parseOldKeys(oldKeysJson))) {
      this.keys.set(id, this.decodeKey(id, b64));
    }
  }

  encrypt(plaintext: string, context?: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.keys.get(this.activeKeyId)!, iv);
    if (context) cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const keyId = Buffer.from(this.activeKeyId, 'utf8');
    return Buffer.concat([Buffer.from([keyId.length]), keyId, iv, authTag, ciphertext]);
  }

  decrypt(payload: Buffer, context?: string): string {
    const keyIdLen = payload.readUInt8(0);
    let offset = 1;
    const keyId = payload.subarray(offset, offset + keyIdLen).toString('utf8');
    offset += keyIdLen;
    const iv = payload.subarray(offset, offset + IV_BYTES);
    offset += IV_BYTES;
    const authTag = payload.subarray(offset, offset + TAG_BYTES);
    offset += TAG_BYTES;
    const ciphertext = payload.subarray(offset);

    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Unknown encryption key id: ${keyId}`);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    if (context) decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  /** Stable, non-reversible short digest for displaying a masked secret. */
  fingerprint(plaintext: string): string {
    return createHash('sha256').update(plaintext, 'utf8').digest('hex').slice(0, 12);
  }

  /** Full SHA-256 hex digest for opaque token / OTP hashing (auth refresh, OTP). */
  hashSha256(plaintext: string): string {
    return createHash('sha256').update(plaintext, 'utf8').digest('hex');
  }

  /** HMAC-SHA256 hex for signed bearer tokens (approvals action links). */
  hmacSha256(message: string, secret: string): string {
    return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
  }

  /** Constant-time compare of two hex digests. */
  safeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
    } catch {
      return false;
    }
  }

  private decodeKey(id: string, b64: string): Buffer {
    const key = Buffer.from(b64, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `Encryption key "${id}" must be ${KEY_BYTES} bytes (got ${key.length}); provide a base64-encoded 32-byte key`,
      );
    }
    return key;
  }

  private parseOldKeys(json?: string): Record<string, string> {
    if (!json) return {};
    try {
      const parsed = JSON.parse(json) as Record<string, string>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      throw new Error('APP_ENCRYPTION_KEYS_OLD must be a JSON object of {keyId: base64Key}');
    }
  }
}
