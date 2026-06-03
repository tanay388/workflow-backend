export type GraphProblemCode =
  | 'MISSING_START'
  | 'MULTIPLE_START'
  | 'DUPLICATE_NODE_ID'
  | 'DUPLICATE_NODE_LABEL'
  | 'MISSING_EDGE_NODE'
  | 'UNREACHABLE_NODE'
  | 'NO_TERMINAL'
  | 'DANGLING_PORT'
  | 'INVALID_CONFIG'
  | 'INVALID_EXPRESSION'
  | 'UNKNOWN_VARIABLE'
  | 'FORWARD_REFERENCE'
  | 'MISSING_LLM_KEY';

export type ProblemSeverity = 'error' | 'warning';

export interface GraphProblem {
  nodeId: string | null;
  field: string | null;
  code: GraphProblemCode;
  message: string;
  severity: ProblemSeverity;
}

export interface GraphValidationResult {
  valid: boolean;
  problems: GraphProblem[];
}

export interface FlatVariableField {
  path: string;
  type: string;
  sample: unknown;
  insertText: string;
}

export interface UpstreamNodeVariables {
  nodeId: string;
  label: string;
  type: string;
  fields: FlatVariableField[];
}

export interface NodeVariablesResponse {
  nodeId: string;
  upstream: UpstreamNodeVariables[];
  namespaces: {
    input: FlatVariableField[];
    inputForm: FlatVariableField[];
    vars: FlatVariableField[];
  };
}

export interface PortDefinition {
  id: string;
  label: string;
  required?: boolean;
}

export interface NodeTypeDescriptor {
  key: string;
  label: string;
  category: string;
  description: string;
  configOnly?: boolean;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  configSchema: import('./json-schema').JsonSchema;
  outputSchema: import('./json-schema').JsonSchema;
}
