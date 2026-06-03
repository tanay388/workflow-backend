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
});
