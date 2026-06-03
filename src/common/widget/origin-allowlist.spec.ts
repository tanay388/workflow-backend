import { isOriginAllowed } from './origin-allowlist';

describe('isOriginAllowed', () => {
  it('rejects when allowlist is empty', () => {
    expect(isOriginAllowed([], 'https://app.example.com')).toBe(false);
  });

  it('rejects missing origin and referer', () => {
    expect(isOriginAllowed(['example.com'])).toBe(false);
  });

  it('allows exact host match', () => {
    expect(
      isOriginAllowed(['example.com'], 'https://example.com', undefined),
    ).toBe(true);
  });

  it('allows subdomain via dot suffix', () => {
    expect(
      isOriginAllowed(['.example.com'], 'https://app.example.com'),
    ).toBe(true);
  });

  it('rejects non-allowlisted origin', () => {
    expect(
      isOriginAllowed(['example.com'], 'https://evil.com'),
    ).toBe(false);
  });

  it('falls back to referer', () => {
    expect(
      isOriginAllowed(
        ['example.com'],
        undefined,
        'https://example.com/page',
      ),
    ).toBe(true);
  });

  it('allows any origin when allowAllOrigins is set', () => {
    expect(
      isOriginAllowed([], undefined, undefined, { allowAllOrigins: true }),
    ).toBe(false);
    expect(
      isOriginAllowed(
        [],
        'https://any-site.test',
        undefined,
        { allowAllOrigins: true },
      ),
    ).toBe(true);
  });

  it('allows origins listed in corsOrigins option', () => {
    expect(
      isOriginAllowed(
        [],
        'http://localhost:3000',
        undefined,
        { corsOrigins: ['http://localhost:3000', 'http://localhost:3003'] },
      ),
    ).toBe(true);
    expect(
      isOriginAllowed(
        [],
        'http://localhost:8080',
        undefined,
        { corsOrigins: ['http://localhost:3000'] },
      ),
    ).toBe(false);
  });
});
