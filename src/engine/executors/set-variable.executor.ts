import type { WorkflowNode } from '../../common/types/graph';
import { coerceParamValue } from '../../common/utils/run-input';
import { getWorkflowParameters } from '../../common/utils/workflow-variables';
import { EngineError, type NodeExecutor, type NodeExecutorContext } from '../engine.types';

interface Assignment {
  name?: string;
  value?: unknown;
}

const DANGEROUS_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

export const executeSetVariable: NodeExecutor = async (
  ctx: NodeExecutorContext,
  node: WorkflowNode,
) => {
  const config = node.config ?? {};
  const raw = config.assignments;
  const assignments = Array.isArray(raw) ? (raw as Assignment[]) : [];
  const params = new Map(getWorkflowParameters(ctx.graph).map((p) => [p.key, p]));

  for (const row of assignments) {
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) continue;
    if (DANGEROUS_NAMES.has(name)) {
      throw new EngineError(`Variable name "${name}" is not allowed`, 'node_failed');
    }

    const param = params.get(name);
    if (!param) {
      throw new EngineError(
        `Unknown variable "${name}" — declare it in Workflow variables first`,
        'node_failed',
      );
    }
    if (param.mutable === false) {
      throw new EngineError(
        `Variable "${name}" is a run parameter and cannot be updated during execution`,
        'node_failed',
      );
    }

    const resolved = ctx.resolveConfig({
      value: row.value ?? '',
    }).value;

    const coerced = coerceParamValue(resolved, param.type);
    if (!coerced.ok) {
      throw new EngineError(
        `Variable "${name}" expects a ${param.type}${coerced.detail ? ` (${coerced.detail})` : ''}`,
        'node_failed',
      );
    }
    ctx.setVar(name, coerced.value);
  }

  return {
    port: 'out',
    data: ctx.getInput(),
  };
};
