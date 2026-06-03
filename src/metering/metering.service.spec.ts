import { costUsd } from '../common/utils/tokens';

describe('MeteringService cost helper', () => {
  it('computes cost from tokens and price', () => {
    expect(costUsd(1_000_000, 5)).toBe(5);
    expect(costUsd(500_000, 10)).toBe(5);
    expect(costUsd(0, 10)).toBe(0);
  });
});
