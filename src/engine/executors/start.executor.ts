import type { WorkflowNode } from '../../common/types/graph';
import { EngineError, type NodeExecutor, type NodeExecutorContext } from '../engine.types';

export const executeStart: NodeExecutor = async (ctx: NodeExecutorContext, node: WorkflowNode) => {
  const input = ctx.getInput();
  if (input != null && typeof input !== 'object') {
    throw new EngineError('Start node input must be an object', 'invalid_input');
  }
  return {
    port: 'out',
    data: input ?? {},
  };
};
