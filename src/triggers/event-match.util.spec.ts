import { matchesEventFilter } from './event-match.util';

describe('matchesEventFilter', () => {
  it('passes when match is empty', () => {
    expect(matchesEventFilter({}, { status: 'open' })).toBe(true);
    expect(matchesEventFilter(undefined, { status: 'open' })).toBe(true);
  });

  it('matches shallow keys with string coercion', () => {
    expect(matchesEventFilter({ status: 'open' }, { status: 'open' })).toBe(true);
    expect(matchesEventFilter({ status: 'open' }, { status: 'closed' })).toBe(false);
  });

  it('supports dotted paths', () => {
    expect(
      matchesEventFilter({ 'data.id': '42' }, { data: { id: '42' } }),
    ).toBe(true);
  });
});
