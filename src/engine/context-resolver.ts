import { Injectable } from '@nestjs/common';
import { ExpressionService } from '../variables/expression.service';
import type { ResumeState } from './engine.types';

const EXPR_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

@Injectable()
export class ContextResolver {
  constructor(private readonly expressions: ExpressionService) {}

  buildResolverContext(state: {
    input: unknown;
    outputs: Record<string, unknown>;
    vars: Record<string, unknown>;
  }): Record<string, unknown> {
    const node: Record<string, { output: unknown }> = {};
    for (const [label, output] of Object.entries(state.outputs)) {
      node[label] = { output };
    }
    return {
      input: state.input ?? {},
      inputForm: extractInputForm(state.input),
      vars: state.vars ?? {},
      node,
    };
  }

  substituteExpressions(text: string, ctx: Record<string, unknown>): string {
    return text.replace(EXPR_PATTERN, (_match, raw: string) => {
      const value = this.expressions.evaluateExpression(raw.trim(), ctx);
      if (value == null) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    });
  }

  resolveConfigValue(value: unknown, ctx: Record<string, unknown>): unknown {
    if (typeof value === 'string') {
      if (value.includes('{{')) return this.substituteExpressions(value, ctx);
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.resolveConfigValue(v, ctx));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.resolveConfigValue(v, ctx);
      }
      return out;
    }
    return value;
  }

  /** Safe boolean evaluation after {{ }} substitution — no eval/Function. */
  evaluateCondition(expression: string, ctx: Record<string, unknown>): boolean {
    const substituted = this.substituteExpressions(expression, ctx).trim();
    if (!substituted) return false;
    return evaluateBooleanExpression(substituted);
  }

  toResumeState(state: {
    input: unknown;
    outputs: Record<string, unknown>;
    vars: Record<string, unknown>;
    nextNodeId: string | null;
    cancelRequested?: boolean;
  }): ResumeState {
    return {
      input: state.input,
      outputs: state.outputs,
      vars: state.vars,
      nextNodeId: state.nextNodeId,
      cancelRequested: state.cancelRequested,
    };
  }
}

function extractInputForm(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const form = (input as Record<string, unknown>).form;
    if (form && typeof form === 'object' && !Array.isArray(form)) {
      return form as Record<string, unknown>;
    }
  }
  return {};
}

function evaluateBooleanExpression(expr: string): boolean {
  const tokens = tokenize(expr);
  let pos = 0;

  function parseOr(): boolean {
    let left = parseAnd();
    while (pos < tokens.length && tokens[pos] === '||') {
      pos++;
      left = left || parseAnd();
    }
    return left;
  }

  function parseAnd(): boolean {
    let left = parseNot();
    while (pos < tokens.length && tokens[pos] === '&&') {
      pos++;
      left = left && parseNot();
    }
    return left;
  }

  function parseNot(): boolean {
    if (tokens[pos] === '!') {
      pos++;
      return !parseNot();
    }
    return parseComparison();
  }

  function parseComparison(): boolean {
    if (tokens[pos] === '(') {
      pos++;
      const val = parseOr();
      if (tokens[pos] === ')') pos++;
      return val;
    }

    const left = parseValue();
    const op = tokens[pos];
    if (['==', '===', '!=', '!==', '>', '>=', '<', '<='].includes(op ?? '')) {
      pos++;
      const right = parseValue();
      return compare(left, right, op!);
    }
    return coerceTruthy(left);
  }

  function parseValue(): unknown {
    const t = tokens[pos++];
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === 'null') return null;
    if (t === 'undefined') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(t ?? '')) return Number(t);
    if ((t?.startsWith('"') && t.endsWith('"')) || (t?.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }
    return t;
  }

  return parseOr();
}

function compare(left: unknown, right: unknown, op: string): boolean {
  switch (op) {
    case '==':
      // eslint-disable-next-line eqeqeq
      return left == right;
    case '===':
      return left === right;
    case '!=':
      // eslint-disable-next-line eqeqeq
      return left != right;
    case '!==':
      return left !== right;
    case '>':
      return Number(left) > Number(right);
    case '>=':
      return Number(left) >= Number(right);
    case '<':
      return Number(left) < Number(right);
    case '<=':
      return Number(left) <= Number(right);
    default:
      return false;
  }
}

function coerceTruthy(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0 && v !== 'false' && v !== '0';
  return v != null;
}

function tokenize(expr: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if ('()'.includes(ch)) {
      out.push(ch);
      i++;
      continue;
    }
    const two = expr.slice(i, i + 2);
    if (['==', '!=', '>=', '<=', '&&', '||'].includes(two)) {
      out.push(two);
      i += 2;
      continue;
    }
    if ('!<>=,'.includes(ch)) {
      out.push(ch);
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < expr.length && expr[j] !== quote) j++;
      out.push(expr.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < expr.length && /[^\s()!<>=,&|]/.test(expr[j]!)) j++;
    out.push(expr.slice(i, j));
    i = j;
  }
  return out;
}
