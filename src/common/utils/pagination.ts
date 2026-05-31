import type { NormalizedPagination, PaginatedResult } from '../dto/pagination.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Clamp/normalize raw page/limit into safe values + a SQL offset.
 * Defensive: callers may pass undefined or out-of-range numbers.
 */
export function normalizePagination(
  input: { page?: number; limit?: number } = {},
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): NormalizedPagination {
  const maxLimit = opts.maxLimit ?? MAX_LIMIT;
  const defaultLimit = opts.defaultLimit ?? DEFAULT_LIMIT;

  const page = Math.max(1, Math.floor(input.page ?? 1) || 1);
  const rawLimit = Math.floor(input.limit ?? defaultLimit) || defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, rawLimit));

  return { page, limit, offset: (page - 1) * limit };
}

/** Build a paginated response envelope. */
export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return { data, page, limit, total, totalPages: Math.ceil(total / limit) || 0 };
}
