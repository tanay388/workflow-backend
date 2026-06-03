import { Injectable } from '@nestjs/common';
import type { WorkflowNode } from '../../common/types/graph';
import { ContextResolver } from '../context-resolver';
import type { NodeExecutor, NodeExecutorContext, ResumeState } from '../engine.types';
import { WaitService } from '../../approvals/wait.service';
@Injectable()
export class WaitExecutor {
  constructor(
    private readonly wait: WaitService,
    private readonly resolver: ContextResolver,
  ) {}

  execute: NodeExecutor = async (ctx: NodeExecutorContext, node: WorkflowNode) => {
    const resumed = await this.wait.consumeWaitResume(ctx.runId, node.id);
    if (resumed) return resumed;

    const config = ctx.resolveConfig(node.config ?? {});
    const inEdge = ctx.graph.edges.find((e) => e.target_node_id === node.id);
    const predecessorNodeId = inEdge?.source_node_id ?? null;

    const resumeState: ResumeState = this.resolver.toResumeState({
      input: ctx.getInput(),
      outputs: ctx.getOutputs(),
      vars: ctx.getVars(),
      nextNodeId: node.id,
    });

    return this.wait.enterWait({
      runId: ctx.runId,
      node,
      graph: ctx.graph,
      resumeState,
      predecessorNodeId,
      config,
      contextPayload: ctx.getInput(),
    }) as never;
  };
}
