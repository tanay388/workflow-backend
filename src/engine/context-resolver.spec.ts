import { Test } from '@nestjs/testing';
import { ExpressionService } from '../variables/expression.service';
import { ContextResolver } from './context-resolver';

describe('ContextResolver', () => {
  let resolver: ContextResolver;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ContextResolver, ExpressionService],
    }).compile();
    resolver = module.get(ContextResolver);
  });

  it('substitutes input expressions', () => {
    const ctx = resolver.buildResolverContext({
      input: { score: 9 },
      outputs: {},
      vars: {},
    });
    expect(resolver.substituteExpressions('{{ input.score }}', ctx)).toBe('9');
  });

  it('evaluates simple boolean conditions', () => {
    const ctx = resolver.buildResolverContext({
      input: { score: 9 },
      outputs: {},
      vars: {},
    });
    expect(resolver.evaluateCondition('{{ input.score }} > 5', ctx)).toBe(true);
    expect(resolver.evaluateCondition('{{ input.score }} < 5', ctx)).toBe(false);
  });

  it('resolves node output references', () => {
    const ctx = resolver.buildResolverContext({
      input: {},
      outputs: { Start: { ok: true } },
      vars: {},
    });
    expect(resolver.evaluateCondition('{{ node.Start.output.ok }} == true', ctx)).toBe(true);
  });

  it('aliases input.* and vars.* over the unified parameter bag', () => {
    const ctx = resolver.buildResolverContext({
      input: { message: 'hi' },
      outputs: {},
      vars: { topic: 'news' },
    });
    expect(resolver.substituteExpressions('{{ vars.topic }}', ctx)).toBe('news');
    expect(resolver.substituteExpressions('{{ input.topic }}', ctx)).toBe('news');
    // Undeclared raw-input extras stay reachable via input.*
    expect(resolver.substituteExpressions('{{ input.message }}', ctx)).toBe('hi');
  });

  it('returns raw typed values for single-expression config strings', () => {
    const ctx = resolver.buildResolverContext({
      input: {},
      outputs: {},
      vars: { count: 5, options: { a: 1 } },
    });
    expect(resolver.resolveConfigValue('{{ vars.count }}', ctx)).toBe(5);
    expect(resolver.resolveConfigValue('{{ vars.options }}', ctx)).toEqual({ a: 1 });
    expect(resolver.resolveConfigValue('count: {{ vars.count }}', ctx)).toBe('count: 5');
  });

  it('treats missing variables as falsy in conditions', () => {
    const ctx = resolver.buildResolverContext({ input: {}, outputs: {}, vars: {} });
    expect(resolver.evaluateCondition('{{ vars.missing }}', ctx)).toBe(false);
    expect(resolver.evaluateCondition('{{ vars.missing }} == false', ctx)).toBe(false);
    expect(resolver.evaluateCondition('{{ vars.missing }} == undefined', ctx)).toBe(true);
  });

  it('supports strict equality operators', () => {
    const ctx = resolver.buildResolverContext({
      input: {},
      outputs: {},
      vars: { n: 5, s: '5' },
    });
    expect(resolver.evaluateCondition('{{ vars.n }} === 5', ctx)).toBe(true);
    expect(resolver.evaluateCondition('{{ vars.s }} === 5', ctx)).toBe(false);
    expect(resolver.evaluateCondition('{{ vars.s }} !== 5', ctx)).toBe(true);
    expect(resolver.evaluateCondition('{{ vars.n }} !== 5', ctx)).toBe(false);
  });

  it('injects values as literal tokens so user data cannot rewrite conditions', () => {
    const ctx = resolver.buildResolverContext({
      input: {},
      outputs: {},
      vars: { status: 'x || true', empty: '' },
    });
    expect(resolver.evaluateCondition('{{ vars.status }} == "done"', ctx)).toBe(false);
    expect(resolver.evaluateCondition('{{ vars.status }} == "x || true"', ctx)).toBe(true);
    expect(resolver.evaluateCondition('{{ vars.empty }} == ""', ctx)).toBe(true);
  });
});
