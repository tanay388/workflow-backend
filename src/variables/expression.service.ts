import { Injectable } from '@nestjs/common';

export type ExpressionRef =
  | { kind: 'input'; path: string[] }
  | { kind: 'inputForm'; path: string[] }
  | { kind: 'vars'; path: string[] }
  | { kind: 'node'; nodeRef: string; path: string[] };

const EXPR_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;
const FORBIDDEN = /\b(process|require|global|eval|Function|constructor|import)\b/i;

@Injectable()
export class ExpressionService {
  extractExpressions(text: string): string[] {
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(EXPR_PATTERN.source, 'g');
    while ((m = re.exec(text)) !== null) {
      matches.push(m[1]!.trim());
    }
    return matches;
  }

  parseExpression(raw: string): ExpressionRef | null {
    if (FORBIDDEN.test(raw) || raw.includes('(') || raw.includes(')')) {
      return null;
    }
    const parts = raw.split('.').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return null;

    if (parts[0] === 'input') {
      if (parts[1] === 'form') return { kind: 'inputForm', path: parts.slice(2) };
      return { kind: 'input', path: parts.slice(1) };
    }
    if (parts[0] === 'vars') return { kind: 'vars', path: parts.slice(1) };
    if (parts[0] === 'node' && parts.length >= 3 && parts[2] === 'output') {
      return { kind: 'node', nodeRef: parts[1]!, path: parts.slice(3) };
    }
    return null;
  }

  resolveType(
    ref: ExpressionRef,
    namespace: {
      inputFields: Set<string>;
      inputFormFields: Set<string>;
      varsFields?: Set<string>;
      upstreamNodeRefs: Map<string, Set<string>>;
    },
  ): { ok: boolean; type?: string; reason?: string } {
    if (ref.kind === 'input') {
      const key = ref.path.join('.');
      if (!key || !namespace.inputFields.has(key)) {
        return { ok: false, reason: `Unknown input field "${key || '?'}"` };
      }
      return { ok: true, type: 'string' };
    }
    if (ref.kind === 'inputForm') {
      const key = ref.path.join('.');
      if (!key) return { ok: true, type: 'unknown' };
      if (!namespace.inputFormFields.has(key)) {
        return { ok: false, reason: `Unknown form field "${key}"` };
      }
      return { ok: true, type: 'string' };
    }
    if (ref.kind === 'vars') {
      const key = ref.path.join('.');
      if (!key) return { ok: false, reason: 'Empty vars reference' };
      const varsFields = namespace.varsFields;
      if (varsFields && varsFields.size > 0 && !varsFields.has(key)) {
        return { ok: false, reason: `Unknown pipeline variable "${key}"` };
      }
      return { ok: true, type: 'unknown' };
    }
    if (ref.kind === 'node') {
      const fields = namespace.upstreamNodeRefs.get(ref.nodeRef);
      if (!fields) {
        return { ok: false, reason: `Node "${ref.nodeRef}" is not upstream or unknown` };
      }
      const key = ref.path.join('.');
      if (!key) return { ok: true, type: 'object' };
      if (!fields.has(key) && !this.hasLooseMatch(fields, key)) {
        return { ok: false, reason: `Field "${key}" not found on node "${ref.nodeRef}"` };
      }
      return { ok: true, type: 'unknown' };
    }
    return { ok: false, reason: 'Invalid expression' };
  }

  private hasLooseMatch(fields: Set<string>, key: string): boolean {
    for (const f of fields) {
      if (f.startsWith(`${key}.`) || key.startsWith(`${f}.`)) return true;
    }
    return false;
  }

  /** Sandboxed preview — property walk only, no eval. */
  evaluateExpression(raw: string, ctx: Record<string, unknown>): unknown {
    const ref = this.parseExpression(raw);
    if (!ref) return undefined;

    if (ref.kind === 'input') return this.walk(ctx.input, ref.path);
    if (ref.kind === 'inputForm') return this.walk(ctx.inputForm, ref.path);
    if (ref.kind === 'vars') return this.walk(ctx.vars, ref.path);
    if (ref.kind === 'node') {
      const nodes = ctx.node as Record<string, { output?: unknown }> | undefined;
      const bucket = nodes?.[ref.nodeRef]?.output;
      return this.walk(bucket, ref.path);
    }
    return undefined;
  }

  private walk(obj: unknown, path: string[]): unknown {
    let cur: unknown = obj;
    for (const seg of path) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[seg];
    }
    return cur;
  }
}
