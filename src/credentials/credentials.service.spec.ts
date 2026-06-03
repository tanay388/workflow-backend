import { CryptoService } from '../common/crypto/crypto.service';

describe('CredentialsService crypto', () => {
  const crypto = new CryptoService({
    encryption: {
      activeKeyId: 'v1',
      activeKey: Buffer.alloc(32, 7).toString('base64'),
    },
  } as never);

  it('encrypt/decrypt round-trip with AAD', () => {
    const aad = 'org:org-1:llm:openai';
    const enc = crypto.encrypt('sk-secret-key', aad);
    expect(crypto.decrypt(enc, aad)).toBe('sk-secret-key');
    expect(() => crypto.decrypt(enc, 'org:other:llm:openai')).toThrow();
  });

  it('fingerprint is stable', () => {
    expect(crypto.fingerprint('sk-abc')).toBe(crypto.fingerprint('sk-abc'));
    expect(crypto.fingerprint('sk-abc')).not.toBe(crypto.fingerprint('sk-xyz'));
  });
});
