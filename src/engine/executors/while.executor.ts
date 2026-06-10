import type { WorkflowNode } from '../../common/types/graph';
import { EngineError, type NodeExecutor } from '../engine.types';

export const executeWhile: NodeExecutor = async (ctx, node: WorkflowNode) => {
  const config = node.config ?? {};
  const condition = config.condition;
  if (typeof condition !== 'string' || !condition.trim()) {
    throw new EngineError(`While node ${node.id} missing condition`, 'node_failed');
  }

  const configured = Number(config.max_iterations ?? 20);
  // Guard against NaN/zero/negative values disabling the cap.
  const maxIterations =
    Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 20;
  const current = ctx.getLoopCount(node.id);

  if (current >= maxIterations) {
    return {
      port: 'end',
      data: { iterations: current, reason: 'max_iterations', passthrough: ctx.getOutputs() },
    };
  }

  const shouldLoop = ctx.evaluateCondition(condition);
  if (shouldLoop) {
    ctx.setLoopCount(node.id, current + 1);
    return {
      port: 'loop',
      data: { iterations: current + 1, passthrough: ctx.getOutputs() },
    };
  }

  return {
    port: 'end',
    data: { iterations: current, passthrough: ctx.getOutputs() },
  };
};
