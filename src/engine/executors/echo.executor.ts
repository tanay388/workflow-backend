import type { WorkflowNode } from '../../common/types/graph';
import type { NodeExecutor } from '../engine.types';

/** Test-only executor — echoes resolved config on the out port. */
export const executeEcho: NodeExecutor = async (ctx, node: WorkflowNode) => {
  const resolved = ctx.resolveConfig(node.config ?? {});
  return { port: 'out', data: resolved };
};
