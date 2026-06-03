import { RecaptchaVerifier } from './recaptcha.verifier';

describe('RecaptchaVerifier', () => {
  const config = {
    recaptcha: { secretKey: undefined, siteKey: undefined, minScore: 0.5 },
  };

  it('skips verification when no secret configured', async () => {
    const verifier = new RecaptchaVerifier(config as never);
    const result = await verifier.verify(undefined);
    expect(result.ok).toBe(true);
  });

  it('fails when token missing and secret set', async () => {
    const withSecret = {
      recaptcha: { secretKey: 'test', siteKey: 'site', minScore: 0.5 },
    };
    const verifier = new RecaptchaVerifier(withSecret as never);
    const result = await verifier.verify('');
    expect(result.ok).toBe(false);
  });
});
