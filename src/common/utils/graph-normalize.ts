import { randomUUID } from 'node:crypto';
import type { WorkflowGraph, WorkflowNode } from '../types/graph';

interface ConditionRow {
  id?: string;
  label?: string;
  condition?: string;
  type?: string;
}

function newBranchId(): string {
  return `branch_${randomUUID().slice(0, 8)}`;
}

function normalizeIfElseNode(node: WorkflowNode): WorkflowNode {
  const config = { ...(node.config ?? {}) };
  const mode = String(config.conditionMode ?? 'simple');
  if (mode !== 'multi' || !Array.isArray(config.conditions)) {
    return { ...node, config };
  }

  const rows = (config.conditions as ConditionRow[]).map((row, index) => {
    const type = row.type === 'else' ? 'else' : 'if';
    const id =
      row.id?.trim() ||
      (type === 'else' ? 'else' : newBranchId());
    return {
      ...row,
      id,
      type,
      label: row.label ?? (type === 'else' ? 'Otherwise' : `Branch ${index + 1}`),
    };
  });

  // Move any else row to the end (executor stops at first else).
  const elseRows = rows.filter((r) => r.type === 'else');
  const ifRows = rows.filter((r) => r.type !== 'else');
  const normalized = [...ifRows, ...elseRows.slice(0, 1)];

  return {
    ...node,
    config: { ...config, conditionMode: 'multi', conditions: normalized },
  };
}

/** Canonicalize graph node configs on save (branch ids, ordering). */
export function normalizeGraphNodes(graph: WorkflowGraph): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (n.type === 'builtins.IfElse') return normalizeIfElseNode(n);
      return n;
    }),
  };
}
