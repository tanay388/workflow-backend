/**
 * Canonical node catalog metadata — mirrors `apps/web/src/lib/editor/node-catalog.ts`.
 * Used by validation, engine NodeRegistry (P06), and GET /node-types (P05).
 */

export type NodeCategory = 'triggers' | 'logic' | 'ai' | 'human';

export interface NodeCatalogMeta {
  type: string;
  label: string;
  category: NodeCategory;
  configOnly?: boolean;
  inputs: string[];
  outputs: string[];
}

export const NODE_CATALOG_META: NodeCatalogMeta[] = [
  { type: 'builtins.Start', label: 'Start', category: 'triggers', inputs: [], outputs: ['out'] },
  {
    type: 'builtins.Trigger.WorkflowChain',
    label: 'Workflow Chain',
    category: 'triggers',
    configOnly: true,
    inputs: [],
    outputs: [],
  },
  {
    type: 'builtins.IfElse',
    label: 'If / Else',
    category: 'logic',
    inputs: ['in'],
    outputs: ['true', 'false'],
  },
  {
    type: 'builtins.While',
    label: 'While Loop',
    category: 'logic',
    inputs: ['in'],
    outputs: ['loop', 'end'],
  },
  {
    type: 'builtins.SetVariable',
    label: 'Set Variable',
    category: 'logic',
    inputs: ['in'],
    outputs: ['out'],
  },
  { type: 'builtins.Wait', label: 'Wait', category: 'logic', inputs: ['in'], outputs: ['out'] },
  {
    type: 'builtins.Agent',
    label: 'AI Agent',
    category: 'ai',
    inputs: ['in'],
    outputs: ['out'],
  },
  {
    type: 'builtins.UserApproval',
    label: 'Human Approval',
    category: 'human',
    inputs: ['in'],
    outputs: ['approved', 'rejected'],
  },
];

export function isConfigOnlyTrigger(type: string): boolean {
  return NODE_CATALOG_META.some((n) => n.type === type && n.configOnly);
}

export function isExecutionNodeType(type: string): boolean {
  const meta = NODE_CATALOG_META.find((n) => n.type === type);
  return Boolean(meta && !meta.configOnly);
}
