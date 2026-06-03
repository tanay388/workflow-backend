import { ExpressionService } from './expression.service';

describe('ExpressionService', () => {
  const svc = new ExpressionService();

  it('extracts multiple expressions', () => {
    const exprs = svc.extractExpressions('Hello {{ input.name }} and {{ vars.x }}');
    expect(exprs).toEqual(['input.name', 'vars.x']);
  });

  it('parses node output reference', () => {
    const ref = svc.parseExpression('node.Summarizer.output.text');
    expect(ref).toEqual({ kind: 'node', nodeRef: 'Summarizer', path: ['text'] });
  });

  it('rejects unsafe expressions', () => {
    expect(svc.parseExpression('process.env.SECRET')).toBeNull();
    expect(svc.parseExpression('require("fs")')).toBeNull();
    expect(svc.parseExpression('foo()')).toBeNull();
  });

  it('evaluates whitelisted namespace without eval', () => {
    const val = svc.evaluateExpression('input.query', {
      input: { query: 'hello' },
    });
    expect(val).toBe('hello');
  });
});
