import type { WorkflowNode } from '../../common/types/graph';
import { EngineError, type NodeExecutor } from '../engine.types';

export const executeAgentStub: NodeExecutor = async (ctx, node: WorkflowNode) => {
  const config = ctx.resolveConfig(node.config ?? {});
  return {
    port: 'out',
    data: {
      stub: true,
      instructions: config.instructions ?? null,
      model: config.model ?? null,
    },
  };
};

export const executeWaitStub: NodeExecutor = async (_ctx, node: WorkflowNode) => {
  throw new EngineError(
    `Wait node is not implemented yet (node ${node.id}). Coming in Phase 10.`,
    'unsupported',
  );
};

export const executeUserApprovalStub: NodeExecutor = async (_ctx, node: WorkflowNode) => {
  throw new EngineError(
    `UserApproval node is not implemented yet (node ${node.id}). Coming in Phase 10.`,
    'unsupported',
  );
};
