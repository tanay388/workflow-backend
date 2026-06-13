import type { MeterContext } from '../common/llm/llm.types';
import type { WorkflowGraph, WorkflowNode } from '../common/types/graph';

export interface NodeExecutionResult {
  port: string;
  data: unknown;
}

export interface WaitPauseState {
  nodeId: string;
  mode: string;
  approvalId?: string;
}

export interface WaitResumeState {
  nodeId: string;
  port: string;
  data?: unknown;
}

export interface ResumeState {
  input: unknown;
  outputs: Record<string, unknown>;
  vars: Record<string, unknown>;
  /** Engine-internal loop counters keyed by node id (not part of the vars namespace). */
  loops?: Record<string, number>;
  /** Next node to execute after last_completed_node_id. */
  nextNodeId: string | null;
  cancelRequested?: boolean;
  waitPause?: WaitPauseState;
  waitResume?: WaitResumeState;
}

export interface StepTraceRecord {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  seq: number;
  status: string;
}

export interface EngineRunOptions {
  graph: WorkflowGraph;
  runId: string;
  orgId: string;
  workspaceId: string;
  workflowId: string;
  workflowVersionId: string;
  input: unknown;
  triggerSource?: string;
  conversationId?: string | null;
  messageId?: string | null;
  maxSteps: number;
  startNodeId?: string;
  presetState?: ResumeState;
  isCanceled?: () => Promise<boolean>;
  onStepStart?: (payload: StepStartPayload) => Promise<void>;
  onStepEnd?: (payload: StepEndPayload) => Promise<void>;
  onBoundary?: (payload: BoundaryPayload) => Promise<void>;
}

export interface StepStartPayload {
  stepId: string;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  seq: number;
  input: unknown;
}

export interface StepEndPayload {
  stepId: string;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  seq: number;
  status: 'completed' | 'failed';
  output?: unknown;
  error?: string;
}

export interface BoundaryPayload {
  lastCompletedNodeId: string;
  resumeState: ResumeState;
  output?: unknown;
}

export interface EngineRunResult {
  status: 'completed' | 'failed' | 'canceled' | 'paused';
  output?: unknown;
  error?: string;
  paused?: { resumeAt: Date | null; waitMode: string };
}

export interface NodeExecutorContext {
  runId: string;
  orgId: string;
  workspaceId: string;
  workflowId: string;
  workflowVersionId: string;
  stepId: string;
  meter: MeterContext;
  graph: WorkflowGraph;
  triggerSource?: string;
  conversationId?: string | null;
  messageId?: string | null;
  runInput: unknown;
  getInput(): unknown;
  getOutputs(): Record<string, unknown>;
  getVars(): Record<string, unknown>;
  setVar(name: string, value: unknown): void;
  getLoopCount(nodeId: string): number;
  setLoopCount(nodeId: string, count: number): void;
  setNodeOutput(nodeId: string, label: string, data: unknown): void;
  resolveConfig(config: Record<string, unknown>): Record<string, unknown>;
  evaluateCondition(expression: string): boolean;
}

export type NodeExecutor = (
  ctx: NodeExecutorContext,
  node: WorkflowNode,
) => Promise<NodeExecutionResult>;

export class EngineError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'max_steps'
      | 'node_failed'
      | 'node_timeout'
      | 'unsupported'
      | 'invalid_input' = 'node_failed',
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export class RunCanceledError extends Error {
  constructor() {
    super('Run canceled');
    this.name = 'RunCanceledError';
  }
}

export class RunPausedError extends Error {
  constructor(readonly pause: { resumeAt: Date | null; waitMode: string }) {
    super('Run paused');
    this.name = 'RunPausedError';
  }
}

export function findStartNode(graph: WorkflowGraph): WorkflowNode | undefined {
  return graph.nodes.find((n) => n.type === 'builtins.Start');
}

export function findNextEdge(
  graph: WorkflowGraph,
  sourceNodeId: string,
  port: string,
) {
  return graph.edges.find(
    (e) => e.source_node_id === sourceNodeId && e.source_port_id === port,
  );
}

export function resolveMaxSteps(graph: WorkflowGraph, platformCeiling: number): number {
  const graphMax = graph.max_steps;
  if (graphMax == null) return platformCeiling;
  return Math.min(graphMax, platformCeiling);
}
