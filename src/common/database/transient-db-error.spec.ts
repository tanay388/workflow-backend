import { QueryFailedError } from 'typeorm';
import { formatDbError, isTransientDbError } from './transient-db-error';

describe('isTransientDbError', () => {
  it('detects EADDRNOTAVAIL on driver error', () => {
    const err = new QueryFailedError('', [], new Error('read EADDRNOTAVAIL') as Error & {
      code: string;
    });
    (err.driverError as Error & { code: string }).code = 'EADDRNOTAVAIL';
    expect(isTransientDbError(err)).toBe(true);
  });

  it('detects postgres cannot_connect_now', () => {
    expect(isTransientDbError({ code: '57P03', message: 'cannot connect now' })).toBe(true);
  });

  it('detects connection terminated message', () => {
    expect(
      isTransientDbError(new Error('Connection terminated unexpectedly')),
    ).toBe(true);
  });

  it('returns false for unknown application errors', () => {
    expect(isTransientDbError(new Error('invalid input syntax'))).toBe(false);
  });
});

describe('formatDbError', () => {
  it('includes code when present', () => {
    expect(formatDbError({ code: 'ECONNRESET', message: 'read ECONNRESET' })).toBe(
      'read ECONNRESET (ECONNRESET)',
    );
  });
});
