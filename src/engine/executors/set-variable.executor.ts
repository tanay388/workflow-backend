import type { WorkflowNode } from '../../common/types/graph';
import type { NodeExecutor, NodeExecutorContext } from '../engine.types';

interface Assignment {
  name?: string;
  value?: unknown;
}

export const executeSetVariable: NodeExecutor = async (
  ctx: NodeExecutorContext,
  node: WorkflowNode,
) => {
  const config = node.config ?? {};
  const raw = config.assignments;
  const assignments = Array.isArray(raw) ? (raw as Assignment[]) : [];

  for (const row of assignments) {
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) continue;
    const resolved = ctx.resolveConfig({
      value: row.value ?? '',
    }).value;
    ctx.setVar(name, resolved);
  }

  return {
    port: 'out',
    data: ctx.getInput(),
  };
};
