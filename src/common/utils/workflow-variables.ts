import type { WorkflowGraph, WorkflowParameter } from '../types/graph';

export type WorkflowVarType = 'string' | 'number' | 'boolean' | 'object';

export const PARAMETER_KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Keys reserved for platform internals; always stripped from caller-provided
 * run input and re-injected server-side where applicable.
 */
export const RESERVED_INPUT_KEYS = new Set(['_chat']);

export interface WorkflowVarDefinition {
  type: WorkflowVarType;
  default?: unknown;
  title?: string;
  description?: string;
}

export interface InputSchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
}

const CHAT_INPUT_KEYS = ['message', 'user_message', 'chat_message', 'text', 'query'] as const;

export function getInputSchemaProperties(
  graph: WorkflowGraph,
): Record<string, InputSchemaProperty> {
  const schema = graph.input_schema as { properties?: Record<string, InputSchemaProperty> };
  return schema?.properties ?? {};
}

/**
 * Canonical read of workflow parameters with dual-read fallback:
 * prefers `graph.parameters`; otherwise derives from the legacy
 * `input_schema.properties` (immutable) + `workflow_vars` (mutable) fields.
 */
export function getWorkflowParameters(graph: WorkflowGraph): WorkflowParameter[] {
  if (Array.isArray(graph.parameters)) {
    return graph.parameters.filter(
      (p): p is WorkflowParameter =>
        !!p && typeof p.key === 'string' && PARAMETER_KEY_PATTERN.test(p.key),
    );
  }

  const out: WorkflowParameter[] = [];
  const seen = new Set<string>();
  for (const [name, prop] of Object.entries(getInputSchemaProperties(graph))) {
    out.push({
      key: name,
      type: normalizeParamType(prop.type),
      title: prop.title,
      description: prop.description,
      default: prop.default,
      mutable: false,
    });
    seen.add(name);
  }
  for (const [name, def] of Object.entries(getWorkflowVarDefinitions(graph))) {
    if (seen.has(name)) continue;
    out.push({
      key: name,
      type: normalizeParamType(def.type),
      title: def.title,
      description: def.description,
      default: def.default,
      mutable: true,
    });
  }
  return out;
}

/**
 * Derived legacy `input_schema` for back-compat consumers (Start node output
 * schema, widget forms, old clients). Immutable params map to properties.
 */
export function deriveLegacyFields(parameters: WorkflowParameter[]): {
  input_schema: Record<string, unknown>;
  workflow_vars: Record<string, WorkflowVarDefinition>;
} {
  const properties: Record<string, InputSchemaProperty> = {};
  const workflowVars: Record<string, WorkflowVarDefinition> = {};
  for (const p of parameters) {
    const def = {
      type: p.type,
      title: p.title ?? p.key,
      description: p.description,
      default: p.default,
    };
    if (p.mutable) {
      workflowVars[p.key] = def;
    } else {
      properties[p.key] = def;
    }
  }
  return {
    input_schema: { type: 'object', properties },
    workflow_vars: workflowVars,
  };
}

/**
 * Normalize a graph to the canonical parameter model: ensures `parameters`
 * is populated (migrating legacy fields on first save) and keeps the derived
 * legacy fields in sync for back-compat consumers.
 */
export function normalizeGraphParameters(graph: WorkflowGraph): WorkflowGraph {
  const parameters = getWorkflowParameters(graph);
  return {
    ...graph,
    parameters,
    ...deriveLegacyFields(parameters),
  };
}

/**
 * Initial unified parameter bag for a run: every declared parameter gets its
 * default (or the type's zero value); validated run input overrides.
 */
export function buildInitialParamBag(
  graph: WorkflowGraph,
  runInput?: Record<string, unknown>,
): Record<string, unknown> {
  const bag: Record<string, unknown> = {};
  const params = getWorkflowParameters(graph);
  for (const p of params) {
    bag[p.key] = p.default !== undefined ? p.default : defaultForType(p.type);
  }
  if (runInput) {
    for (const p of params) {
      if (runInput[p.key] !== undefined) bag[p.key] = runInput[p.key];
    }
  }
  return bag;
}

function normalizeParamType(type: string | undefined): WorkflowVarType {
  return type === 'number' || type === 'boolean' || type === 'object' ? type : 'string';
}

export function getWorkflowVarDefinitions(
  graph: WorkflowGraph,
): Record<string, WorkflowVarDefinition> {
  return graph.workflow_vars ?? {};
}

/** Default values for pipeline variables (`vars.*`). */
export function buildInitialVars(graph: WorkflowGraph): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(getWorkflowVarDefinitions(graph))) {
    if (def.default !== undefined) {
      out[name] = def.default;
    } else {
      out[name] = defaultForType(def.type);
    }
  }
  return out;
}

/** Default run input from `input_schema` property defaults. */
export function buildDefaultRunInput(graph: WorkflowGraph): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, prop] of Object.entries(getInputSchemaProperties(graph))) {
    if (prop.default !== undefined) {
      out[name] = prop.default;
    } else {
      out[name] = defaultForType((prop.type as WorkflowVarType) ?? 'string');
    }
  }
  return out;
}

export function mergeRunInput(
  graph: WorkflowGraph,
  provided: unknown,
): Record<string, unknown> {
  const defaults = buildDefaultRunInput(graph);
  if (provided == null) return defaults;
  if (typeof provided !== 'object' || Array.isArray(provided)) {
    return { ...defaults, value: provided };
  }
  return { ...defaults, ...(provided as Record<string, unknown>) };
}

export function extractChatUserMessage(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input === 'string') return input.trim() || null;
  if (typeof input !== 'object' || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  for (const key of CHAT_INPUT_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function defaultForType(type: WorkflowVarType): unknown {
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
