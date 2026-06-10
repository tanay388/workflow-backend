import type { WorkflowGraph, WorkflowParameter } from '../types/graph';
import {
  RESERVED_INPUT_KEYS,
  getWorkflowParameters,
  type WorkflowVarType,
} from './workflow-variables';

export interface RunInputProblem {
  field: string;
  message: string;
}

export interface ValidatedRunInput {
  ok: boolean;
  /** Coerced input: declared params (defaults applied) + passthrough extras. */
  input: Record<string, unknown>;
  problems: RunInputProblem[];
}

export interface ValidateRunInputOptions {
  /**
   * strict — collect problems for the caller to reject (interactive paths).
   * lenient — fall back to defaults on invalid values; never block (automation paths).
   */
  mode: 'strict' | 'lenient';
}

/**
 * Validate and coerce caller-provided run input against the workflow's
 * declared parameters. Reserved platform keys (e.g. `_chat`) are always
 * stripped — services re-inject them server-side after validation.
 * Undeclared extra keys pass through untouched (webhook payloads, chat
 * `message`, etc. are legitimate undeclared input).
 */
export function validateRunInput(
  graph: WorkflowGraph | undefined,
  provided: unknown,
  options: ValidateRunInputOptions,
): ValidatedRunInput {
  const problems: RunInputProblem[] = [];
  const raw = normalizeProvided(provided);

  for (const key of Object.keys(raw)) {
    if (RESERVED_INPUT_KEYS.has(key)) delete raw[key];
  }

  if (!graph) return { ok: true, input: raw, problems };

  const params = getWorkflowParameters(graph);
  const out: Record<string, unknown> = { ...raw };

  for (const p of params) {
    const has = raw[p.key] !== undefined && raw[p.key] !== null;
    if (!has) {
      if (p.required && p.default === undefined) {
        problems.push({ field: p.key, message: `"${p.key}" is required` });
        if (options.mode === 'lenient') out[p.key] = zeroValue(p.type);
        continue;
      }
      out[p.key] = p.default !== undefined ? p.default : zeroValue(p.type);
      continue;
    }

    const coerced = coerceParamValue(raw[p.key], p.type);
    if (!coerced.ok) {
      problems.push({
        field: p.key,
        message: `"${p.key}" must be a ${p.type}${coerced.detail ? ` (${coerced.detail})` : ''}`,
      });
      if (options.mode === 'lenient') {
        out[p.key] = p.default !== undefined ? p.default : zeroValue(p.type);
      }
      continue;
    }
    out[p.key] = coerced.value;
  }

  return { ok: problems.length === 0, input: out, problems };
}

function normalizeProvided(provided: unknown): Record<string, unknown> {
  if (provided == null) return {};
  if (typeof provided !== 'object' || Array.isArray(provided)) {
    // Back-compat for non-object trigger bodies (e.g. plain webhook strings).
    return { value: provided };
  }
  return { ...(provided as Record<string, unknown>) };
}

/** Coerce a value to a declared parameter type. Exported for SetVariable type checks. */
export function coerceParamValue(
  value: unknown,
  type: WorkflowParameter['type'],
): { ok: true; value: unknown } | { ok: false; detail?: string } {
  switch (type) {
    case 'string': {
      if (typeof value === 'string') return { ok: true, value };
      if (typeof value === 'number' || typeof value === 'boolean') {
        return { ok: true, value: String(value) };
      }
      return { ok: false, detail: 'got ' + typeName(value) };
    }
    case 'number': {
      if (typeof value === 'number' && Number.isFinite(value)) return { ok: true, value };
      if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        if (Number.isFinite(n)) return { ok: true, value: n };
      }
      return { ok: false, detail: 'got ' + typeName(value) };
    }
    case 'boolean': {
      if (typeof value === 'boolean') return { ok: true, value };
      if (value === 'true' || value === '1' || value === 1) return { ok: true, value: true };
      if (value === 'false' || value === '0' || value === 0) return { ok: true, value: false };
      return { ok: false, detail: 'got ' + typeName(value) };
    }
    case 'object': {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return { ok: true, value };
      }
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value) as unknown;
          if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { ok: true, value: parsed };
          }
        } catch {
          // fall through
        }
      }
      return { ok: false, detail: 'got ' + typeName(value) };
    }
  }
}

function zeroValue(type: WorkflowVarType): unknown {
  switch (type) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'object':
      return {};
    default:
      return '';
  }
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
