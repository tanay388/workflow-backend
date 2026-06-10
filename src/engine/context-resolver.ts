import { Injectable } from '@nestjs/common';
import { ExpressionService } from '../variables/expression.service';
import type { ResumeState } from './engine.types';

const EXPR_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;
const SINGLE_EXPR_PATTERN = /^\{\{\s*([^}]+?)\s*\}\}$/;

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
    // Unified namespace: `input.*` and `vars.*` are aliases over the parameter
    // bag. Declared params (the bag) win; undeclared raw-input extras
    // (message, form, webhook payload fields) remain reachable via `input.*`.
    const rawInput =
      state.input && typeof state.input === 'object' && !Array.isArray(state.input)
        ? (state.input as Record<string, unknown>)
        : {};
    return {
      input: { ...rawInput, ...(state.vars ?? {}) },
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
      // A config value that is exactly one expression resolves to the raw
      // typed value (number stays number, object stays object).
      const single = SINGLE_EXPR_PATTERN.exec(value);
      if (single) {
        return this.expressions.evaluateExpression(single[1]!.trim(), ctx);
      }
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

  /** Safe boolean evaluation — no eval/Function. */
  evaluateCondition(expression: string, ctx: Record<string, unknown>): boolean {
    const substituted = this.substituteForCondition(expression, ctx).trim();
    if (!substituted) return false;
    return evaluateBooleanExpression(substituted);
  }

  /**
   * Condition-safe substitution: values are injected as *literal tokens*
   * (quoted/escaped strings, bare numbers/booleans, `undefined`/`null`)
   * instead of raw text, so user-controlled values cannot rewrite the
   * expression structure and missing values compare correctly.
   */
  private substituteForCondition(expression: string, ctx: Record<string, unknown>): string {
    return expression.replace(EXPR_PATTERN, (_match, raw: string) => {
      const value = this.expressions.evaluateExpression(raw.trim(), ctx);
      return serializeConditionToken(value);
    });
  }

  toResumeState(state: {
    input: unknown;
    outputs: Record<string, unknown>;
    vars: Record<string, unknown>;
    loops?: Record<string, number>;
    nextNodeId: string | null;
    cancelRequested?: boolean;
  }): ResumeState {
    return {
      input: state.input,
      outputs: state.outputs,
      vars: state.vars,
      loops: state.loops,
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
    if (t?.startsWith('"') && t.endsWith('"') && t.length >= 2) {
      try {
        // Double-quoted tokens are JSON-escaped (see serializeConditionToken).
        return JSON.parse(t) as string;
      } catch {
        return t.slice(1, -1);
      }
    }
    if (t?.startsWith("'") && t.endsWith("'") && t.length >= 2) {
      return t.slice(1, -1);
    }
    return t;
  }

  return parseOr();
}

/** Serialize a resolved value as a single literal token for the condition parser. */
function serializeConditionToken(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  // Objects/arrays compare as their JSON text.
  return JSON.stringify(JSON.stringify(value));
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
    const three = expr.slice(i, i + 3);
    if (three === '===' || three === '!==') {
      out.push(three);
      i += 3;
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
      while (j < expr.length && expr[j] !== quote) {
        if (expr[j] === '\\') j++;
        j++;
      }
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
