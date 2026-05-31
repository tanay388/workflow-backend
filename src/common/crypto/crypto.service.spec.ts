import type { AppConfigService } from '../config/config.service';
import { CryptoService } from './crypto.service';

const KEY_V1 = Buffer.alloc(32, 1).toString('base64');
const KEY_V2 = Buffer.alloc(32, 2).toString('base64');

function makeService(encryption: {
  activeKeyId: string;
  activeKey: string;
  oldKeysJson?: string;
}): CryptoService {
  return new CryptoService({ encryption } as unknown as AppConfigService);
}

describe('CryptoService', () => {
  it('round-trips encrypt/decrypt', () => {
    const svc = makeService({ activeKeyId: 'v1', activeKey: KEY_V1 });
    const ct = svc.encrypt('hello world');
    expect(Buffer.isBuffer(ct)).toBe(true);
    expect(svc.decrypt(ct)).toBe('hello world');
  });

  it('binds AAD context — mismatched context fails decryption', () => {
    const svc = makeService({ activeKeyId: 'v1', activeKey: KEY_V1 });
    const ct = svc.encrypt('secret', 'org:1:llm:openai');
    expect(svc.decrypt(ct, 'org:1:llm:openai')).toBe('secret');
    expect(() => svc.decrypt(ct, 'org:2:llm:openai')).toThrow();
    expect(() => svc.decrypt(ct)).toThrow();
  });

  it('decrypts a v1 ciphertext after rotating to a v2 active key', () => {
    const v1 = makeService({ activeKeyId: 'v1', activeKey: KEY_V1 });
    const ctV1 = v1.encrypt('rotate me');

    const v2 = makeService({
      activeKeyId: 'v2',
      activeKey: KEY_V2,
      oldKeysJson: JSON.stringify({ v1: KEY_V1 }),
    });
    expect(v2.decrypt(ctV1)).toBe('rotate me');

    // New ciphertext uses v2; a service holding only v1 cannot decrypt it.
    const ctV2 = v2.encrypt('new secret');
    expect(() => v1.decrypt(ctV2)).toThrow(/Unknown encryption key id: v2/);
  });

  it('fingerprint is stable and non-reversible', () => {
    const svc = makeService({ activeKeyId: 'v1', activeKey: KEY_V1 });
    const fp1 = svc.fingerprint('api-key-abc');
    const fp2 = svc.fingerprint('api-key-abc');
    expect(fp1).toBe(fp2);
    expect(fp1).not.toContain('api-key-abc');
    expect(fp1).toHaveLength(12);
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() =>
      makeService({ activeKeyId: 'v1', activeKey: Buffer.alloc(16, 1).toString('base64') }),
    ).toThrow(/must be 32 bytes/);
  });
});
