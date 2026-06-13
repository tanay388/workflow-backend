import { costUsd, splitCostUsd } from './tokens';

describe('token cost helpers', () => {
  it('computes blended cost from tokens and price', () => {
    expect(costUsd(1_000_000, 5)).toBe(5);
    expect(costUsd(500_000, 10)).toBe(5);
    expect(costUsd(0, 10)).toBe(0);
  });

  it('computes split input/output pricing', () => {
    expect(splitCostUsd(1_000_000, 500_000, 3, 15)).toBe(10.5);
  });
});
