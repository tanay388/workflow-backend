import { normalizePagination, paginate } from './pagination';

describe('normalizePagination', () => {
  it('applies defaults when nothing is provided', () => {
    expect(normalizePagination()).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('clamps limit to the max', () => {
    expect(normalizePagination({ limit: 9999 }).limit).toBe(100);
  });

  it('min-clamps and floors invalid inputs', () => {
    expect(normalizePagination({ page: 0, limit: -5 })).toEqual({ page: 1, limit: 1, offset: 0 });
  });

  it('computes the SQL offset from page/limit', () => {
    expect(normalizePagination({ page: 3, limit: 10 }).offset).toBe(20);
  });

  it('honours custom max/default limits', () => {
    expect(normalizePagination({ limit: 500 }, { maxLimit: 50 }).limit).toBe(50);
    expect(normalizePagination({}, { defaultLimit: 25 }).limit).toBe(25);
  });
});

describe('paginate', () => {
  it('builds a paginated envelope', () => {
    expect(paginate([1, 2], 10, 1, 2)).toEqual({
      data: [1, 2],
      page: 1,
      limit: 2,
      total: 10,
      totalPages: 5,
    });
  });
});
