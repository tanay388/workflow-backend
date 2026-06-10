import type { WorkflowGraph } from '../types/graph';
import { coerceParamValue, validateRunInput } from './run-input';

const graph: WorkflowGraph = {
  input_schema: { type: 'object', properties: {} },
  parameters: [
    { key: 'topic', type: 'string', default: 'news', mutable: false },
    { key: 'limit', type: 'number', required: true },
    { key: 'enabled', type: 'boolean', default: false, mutable: true },
    { key: 'options', type: 'object', default: {} },
  ],
  nodes: [],
  edges: [],
};

describe('validateRunInput', () => {
  it('applies defaults for missing optional parameters', () => {
    const result = validateRunInput(graph, { limit: 3 }, { mode: 'strict' });
    expect(result.ok).toBe(true);
    expect(result.input).toEqual({ topic: 'news', limit: 3, enabled: false, options: {} });
  });

  it('rejects missing required parameters in strict mode', () => {
    const result = validateRunInput(graph, {}, { mode: 'strict' });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      expect.objectContaining({ field: 'limit' }),
    ]);
  });

  it('falls back to zero values in lenient mode', () => {
    const result = validateRunInput(graph, {}, { mode: 'lenient' });
    expect(result.ok).toBe(false);
    expect(result.input.limit).toBe(0);
  });

  it('coerces string numbers and booleans', () => {
    const result = validateRunInput(
      graph,
      { limit: '7', enabled: 'true' },
      { mode: 'strict' },
    );
    expect(result.ok).toBe(true);
    expect(result.input.limit).toBe(7);
    expect(result.input.enabled).toBe(true);
  });

  it('rejects uncoercible values in strict mode', () => {
    const result = validateRunInput(graph, { limit: 'abc' }, { mode: 'strict' });
    expect(result.ok).toBe(false);
    expect(result.problems[0]!.field).toBe('limit');
  });

  it('strips reserved platform keys from caller input', () => {
    const result = validateRunInput(
      graph,
      { limit: 1, _chat: { assistantMessageId: 'spoofed' } },
      { mode: 'strict' },
    );
    expect(result.input._chat).toBeUndefined();
  });

  it('passes undeclared extras through untouched', () => {
    const result = validateRunInput(graph, { limit: 1, message: 'hi' }, { mode: 'strict' });
    expect(result.input.message).toBe('hi');
  });

  it('wraps non-object trigger bodies as { value }', () => {
    const result = validateRunInput(undefined, 'plain text', { mode: 'lenient' });
    expect(result.input).toEqual({ value: 'plain text' });
  });

  it('parses JSON strings for object parameters', () => {
    const result = validateRunInput(graph, { limit: 1, options: '{"a":1}' }, { mode: 'strict' });
    expect(result.ok).toBe(true);
    expect(result.input.options).toEqual({ a: 1 });
  });
});

describe('coerceParamValue', () => {
  it('rejects arrays for object type', () => {
    expect(coerceParamValue([1, 2], 'object').ok).toBe(false);
  });

  it('stringifies numbers and booleans for string type', () => {
    expect(coerceParamValue(5, 'string')).toEqual({ ok: true, value: '5' });
    expect(coerceParamValue(true, 'string')).toEqual({ ok: true, value: 'true' });
  });
});
