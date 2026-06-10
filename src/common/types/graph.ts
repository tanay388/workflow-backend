/** TRD §5 — workflow graph persisted in workflow_versions.graph jsonb. */

export interface GraphPosition {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  position: GraphPosition;
}

export interface WorkflowEdge {
  id: string;
  source_node_id: string;
  source_port_id: string;
  target_node_id: string;
  target_port_id: string;
}

export interface WorkflowVarDefinition {
  type: 'string' | 'number' | 'boolean' | 'object';
  default?: unknown;
  title?: string;
  description?: string;
}

export type WorkflowParameterType = 'string' | 'number' | 'boolean' | 'object';

/**
 * Unified workflow parameter — canonical replacement for both
 * `input_schema.properties` (immutable run parameters) and `workflow_vars`
 * (mutable pipeline variables). Referenced as `{{ vars.<key> }}`;
 * `{{ input.<key> }}` remains a supported alias.
 */
export interface WorkflowParameter {
  key: string;
  type: WorkflowParameterType;
  title?: string;
  description?: string;
  /** Typed JSON default value. */
  default?: unknown;
  /** Must be provided in run input (enforced at enqueue). */
  required?: boolean;
  /** May be written by Set Variable nodes during execution. */
  mutable?: boolean;
}

export interface WorkflowGraph {
  input_schema: Record<string, unknown>;
  /** Legacy pipeline variables; superseded by `parameters` (kept for dual-read). */
  workflow_vars?: Record<string, WorkflowVarDefinition>;
  /** Canonical unified parameters. When present, takes precedence over input_schema/workflow_vars. */
  parameters?: WorkflowParameter[];
  max_steps?: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export type GraphValidationCode =
  | 'MISSING_START'
  | 'MULTIPLE_START'
  | 'DUPLICATE_NODE_ID'
  | 'MISSING_EDGE_NODE';

export interface GraphValidationProblem {
  nodeId: string | null;
  code: GraphValidationCode;
  message: string;
}

export interface GraphValidationResult {
  valid: boolean;
  problems: GraphValidationProblem[];
}

/** Empty graph seeded on workflow creation — single Start node. */
export function createEmptyGraph(): WorkflowGraph {
  return {
    input_schema: { type: 'object', properties: {} },
    nodes: [
      {
        id: 'n_start',
        type: 'builtins.Start',
        label: 'Start',
        config: {},
        position: { x: 80, y: 200 },
      },
    ],
    edges: [],
  };
}
