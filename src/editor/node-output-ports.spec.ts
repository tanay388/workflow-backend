import { resolveNodeOutputPortIds } from './node-output-ports';

describe('resolveNodeOutputPortIds', () => {
  it('returns true/false for simple If/Else', () => {
    expect(resolveNodeOutputPortIds('builtins.IfElse', { conditionMode: 'simple' })).toEqual([
      'true',
      'false',
    ]);
  });

  it('returns branch ids plus none for multi If/Else without else', () => {
    expect(
      resolveNodeOutputPortIds('builtins.IfElse', {
        conditionMode: 'multi',
        conditions: [
          { id: 'a', type: 'if' },
          { id: 'b', type: 'if' },
        ],
      }),
    ).toEqual(['a', 'b', 'none']);
  });

  it('returns mode-aware Wait ports', () => {
    expect(resolveNodeOutputPortIds('builtins.Wait', { mode: 'delay' })).toEqual(['continue']);
    expect(resolveNodeOutputPortIds('builtins.Wait', { mode: 'until_event' })).toEqual([
      'continue',
      'timed_out',
    ]);
    expect(resolveNodeOutputPortIds('builtins.Wait', { mode: 'until_approval' })).toEqual([
      'continue',
      'rejected',
      'timed_out',
    ]);
  });
});
