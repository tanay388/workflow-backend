import type { WorkflowNode } from '../common/types/graph';
import { EngineError } from './engine.types';

export class NodeTimeoutError extends EngineError {
  constructor(nodeLabel: string, timeoutMs: number) {
    super(
      `Node "${nodeLabel}" timed out after ${Math.round(timeoutMs / 1000)}s`,
      'node_timeout',
    );
    this.name = 'NodeTimeoutError';
  }
}

/** Resolve execution timeout (ms) for a node; 0 means no timeout. */
export function resolveNodeTimeoutMs(
  node: WorkflowNode,
  defaults: { agentSeconds: number; agentMaxSeconds: number },
): number {
  if (node.type !== 'builtins.Agent') return 0;

  const configured = Number(node.config?.timeout_seconds);
  const seconds =
    Number.isFinite(configured) && configured > 0
      ? Math.min(Math.floor(configured), defaults.agentMaxSeconds)
      : defaults.agentSeconds;

  return Math.max(seconds, 1) * 1000;
}

export async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Error,
): Promise<T> {
  if (timeoutMs <= 0) return promise;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
