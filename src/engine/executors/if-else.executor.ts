import type { WorkflowNode } from '../../common/types/graph';
import { EngineError, type NodeExecutor } from '../engine.types';
import { snapshotOutputs } from '../output-snapshot';

interface ConditionRow {
  id?: string;
  label?: string;
  condition?: string;
  type?: string;
}

export const executeIfElse: NodeExecutor = async (ctx, node: WorkflowNode) => {
  const config = node.config ?? {};
  const mode = String(config.conditionMode ?? 'simple');

  if (mode === 'multi' && Array.isArray(config.conditions)) {
    const conditions = config.conditions as ConditionRow[];
    for (const cond of conditions) {
      if (cond.type === 'else') {
        return {
          port: cond.id ?? 'else',
          data: { branch: cond.id ?? 'else', passthrough: snapshotOutputs(ctx.getOutputs()) },
        };
      }
      if (cond.condition && ctx.evaluateCondition(cond.condition)) {
        return {
          port: cond.id ?? 'true',
          data: {
            branch: cond.id,
            condition: cond.condition,
            passthrough: snapshotOutputs(ctx.getOutputs()),
          },
        };
      }
    }
    return {
      port: 'none',
      data: { branch: 'none', passthrough: snapshotOutputs(ctx.getOutputs()) },
    };
  }

  const condition = config.condition;
  if (typeof condition !== 'string' || !condition.trim()) {
    throw new EngineError(`IfElse node ${node.id} missing condition`, 'node_failed');
  }

  const result = ctx.evaluateCondition(condition);
  return {
    port: result ? 'true' : 'false',
    data: {
      branch: result ? 'true' : 'false',
      condition,
      passthrough: snapshotOutputs(ctx.getOutputs()),
    },
  };
};
