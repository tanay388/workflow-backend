import { CryptoService } from '../../common/crypto/crypto.service';
import { AppConfigService } from '../../common/config/config.service';
import { HmacVerifier } from './hmac.verifier';

describe('HmacVerifier', () => {
  const crypto = new CryptoService({
    encryption: {
      activeKeyId: 'v1',
      activeKey: Buffer.alloc(32, 7).toString('base64'),
    },
  } as AppConfigService);
  const verifier = new HmacVerifier(crypto);

  it('accepts valid sha256 signature', () => {
    const body = Buffer.from('{"hello":"world"}');
    const secret = 'test-secret';
    const sig = `sha256=${crypto.hmacSha256(body.toString('utf8'), secret)}`;
    expect(verifier.verify(body, secret, sig)).toBe(true);
  });

  it('rejects tampered body', () => {
    const body = Buffer.from('{"hello":"world"}');
    const secret = 'test-secret';
    const sig = `sha256=${crypto.hmacSha256('{"hello":"tampered"}', secret)}`;
    expect(verifier.verify(body, secret, sig)).toBe(false);
  });

  it('rejects missing signature', () => {
    expect(verifier.verify(Buffer.from('x'), 'secret', undefined)).toBe(false);
  });
});
