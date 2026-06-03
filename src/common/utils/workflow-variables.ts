import type { WorkflowGraph } from '../types/graph';

export type WorkflowVarType = 'string' | 'number' | 'boolean' | 'object';

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
