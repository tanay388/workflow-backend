import { Injectable } from '@nestjs/common';
import { buildInitialVars } from '../common/utils/workflow-variables';
import { randomUUID } from 'node:crypto';
import type { WorkflowGraph } from '../common/types/graph';
import { ContextResolver } from './context-resolver';
import {
  EngineError,
  findNextEdge,
  findStartNode,
  RunCanceledError,
  RunPausedError,
  type EngineRunOptions,
  type EngineRunResult,
  type NodeExecutorContext,
  type ResumeState,
} from './engine.types';
import { NodeRegistry } from './node-registry';

@Injectable()
export class WorkflowEngine {
  constructor(
    private readonly registry: NodeRegistry,
    private readonly resolver: ContextResolver,
  ) {}

  async run(options: EngineRunOptions): Promise<EngineRunResult> {
    const { graph, maxSteps } = options;
    const nodeById = new Map<string, WorkflowGraph['nodes'][number]>(
      graph.nodes.map((n) => [n.id, n]),
    );

    let input = options.input;
    let outputs: Record<string, unknown> = {};
    let vars: Record<string, unknown> = buildInitialVars(graph);

    if (options.presetState) {
      input = options.presetState.input;
      outputs = { ...options.presetState.outputs };
      vars = { ...vars, ...options.presetState.vars };
    }

    let currentNodeId =
      options.startNodeId ??
      options.presetState?.nextNodeId ??
      findStartNode(graph)?.id;

    if (!currentNodeId) {
      return { status: 'failed', error: 'No Start node found' };
    }

    let steps = 0;
    let seq = 0;
    let lastOutput: unknown = input;

    while (currentNodeId) {
      if (options.isCanceled && (await options.isCanceled())) {
        return { status: 'canceled' };
      }

      if (steps >= maxSteps) {
        throw new EngineError('max steps exceeded', 'max_steps');
      }

      const node = nodeById.get(currentNodeId);
      if (!node) {
        return { status: 'failed', error: `Node not found: ${currentNodeId}` };
      }

      if (node.type.startsWith('builtins.Trigger.')) {
        return {
          status: 'failed',
          error: `Trigger node ${node.id} must not appear in execution path`,
        };
      }

      const executor = this.registry.get(node.type);
      if (!executor) {
        return { status: 'failed', error: `No executor for node type: ${node.type}` };
      }

      seq++;
      const stepId = randomUUID();
      const resolverCtx = this.resolver.buildResolverContext({ input, outputs, vars });
      const stepInput = {
        input,
        outputs,
        vars,
      };

      const ctx = this.buildExecutorContext(options, graph, stepId, node.id, {
        input,
        outputs,
        vars,
        resolverCtx,
      });

      await options.onStepStart?.({
        stepId,
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: node.label,
        seq,
        input: stepInput,
      });

      try {
        const result = await executor(ctx, node);
        lastOutput = result.data;
        ctx.setNodeOutput(node.id, node.label, result.data);

        const edge = findNextEdge(graph, node.id, result.port);
        const nextNodeId = edge?.target_node_id ?? null;

        await options.onStepEnd?.({
          stepId,
          nodeId: node.id,
          nodeType: node.type,
          nodeLabel: node.label,
          seq,
          status: 'completed',
          output: result.data,
        });

        await options.onBoundary?.({
          lastCompletedNodeId: node.id,
          resumeState: this.resolver.toResumeState({
            input,
            outputs,
            vars,
            nextNodeId,
          }),
          output: nextNodeId ? undefined : result.data,
        });

        if (!nextNodeId) {
          return { status: 'completed', output: result.data };
        }

        currentNodeId = nextNodeId;
        steps++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof RunCanceledError) {
          return { status: 'canceled' };
        }
        if (err instanceof RunPausedError) {
          await options.onStepEnd?.({
            stepId,
            nodeId: node.id,
            nodeType: node.type,
            nodeLabel: node.label,
            seq,
            status: 'completed',
            output: { paused: true, resumeAt: err.pause.resumeAt },
          });
          return {
            status: 'paused',
            paused: err.pause,
          };
        }
        await options.onStepEnd?.({
          stepId,
          nodeId: node.id,
          nodeType: node.type,
          nodeLabel: node.label,
          seq,
          status: 'failed',
          error: message,
        });
        throw err;
      }
    }

    return { status: 'completed', output: lastOutput };
  }

  private buildExecutorContext(
    options: EngineRunOptions,
    graph: EngineRunOptions['graph'],
    stepId: string,
    nodeId: string,
    state: {
      input: unknown;
      outputs: Record<string, unknown>;
      vars: Record<string, unknown>;
      resolverCtx: Record<string, unknown>;
    },
  ): NodeExecutorContext {
    const bag = {
      ...state,
      _outputs: state.outputs,
      _vars: state.vars,
      _resolverCtx: state.resolverCtx,
    };

    const meter = {
      orgId: options.orgId,
      workspaceId: options.workspaceId,
      workflowId: options.workflowId,
      runId: options.runId,
      stepId,
      nodeId,
    };

    return {
      runId: options.runId,
      orgId: options.orgId,
      workspaceId: options.workspaceId,
      workflowId: options.workflowId,
      workflowVersionId: options.workflowVersionId,
      stepId,
      meter,
      graph,
      triggerSource: options.triggerSource,
      conversationId: options.conversationId,
      messageId: options.messageId,
      runInput: options.input,
      getInput: () => bag.input,
      getOutputs: () => bag._outputs,
      getVars: () => bag._vars,
      setVar: (name: string, value: unknown) => {
        bag._vars[name] = value;
        bag._resolverCtx = this.resolver.buildResolverContext({
          input: bag.input,
          outputs: bag._outputs,
          vars: bag._vars,
        });
      },
      setNodeOutput: (nodeId: string, label: string, data: unknown) => {
        bag._outputs[label] = data;
        bag._outputs[nodeId] = data;
        bag._resolverCtx = this.resolver.buildResolverContext({
          input: bag.input,
          outputs: bag._outputs,
          vars: bag._vars,
        });
      },
      resolveConfig: (config: Record<string, unknown>) =>
        this.resolver.resolveConfigValue(config, bag._resolverCtx) as Record<string, unknown>,
      evaluateCondition: (expression: string) =>
        this.resolver.evaluateCondition(expression, bag._resolverCtx),
    };
  }
}
