import { ActionTokenService } from './action-token.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AppConfigService } from '../common/config/config.service';

describe('ActionTokenService', () => {
  const crypto = new CryptoService({
    encryption: {
      activeKeyId: 'v1',
      activeKey: Buffer.alloc(32).toString('base64'),
    },
  } as AppConfigService);

  const cfg = {
    jwt: { secret: 'test-secret-for-hmac-tokens-32chars' },
    frontendUrl: 'http://localhost:3000',
  } as AppConfigService;

  const svc = new ActionTokenService(crypto, cfg);

  it('mints and verifies a token', () => {
    const token = svc.mint('11111111-1111-1111-1111-111111111111');
    const v = svc.verify(token);
    expect(v?.approvalId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('rejects tampered token', () => {
    const token = svc.mint('22222222-2222-2222-2222-222222222222');
    const bad = token.slice(0, -4) + 'ffff';
    expect(svc.verify(bad)).toBeNull();
  });
});
