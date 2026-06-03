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

export interface WorkflowGraph {
  input_schema: Record<string, unknown>;
  /** Pipeline variables available as {{ vars.<name> }}; mutable during execution. */
  workflow_vars?: Record<string, WorkflowVarDefinition>;
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
