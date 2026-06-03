import { queryResultAffected, queryResultRows } from './query-result';

describe('queryResultRows', () => {
  it('unwraps TypeORM UPDATE tuple [rows, rowCount]', () => {
    const rows = [{ id: 'run-1' }, { id: 'run-2' }];
    expect(queryResultRows<{ id: string }>([rows, 2])).toEqual(rows);
  });

  it('returns plain SELECT rows as-is', () => {
    const rows = [{ id: 'run-1' }];
    expect(queryResultRows(rows)).toEqual(rows);
  });
});

describe('queryResultAffected', () => {
  it('reads rowCount from UPDATE tuple', () => {
    expect(queryResultAffected([[], 3])).toBe(3);
  });
});
