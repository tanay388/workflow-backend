import { Injectable } from '@nestjs/common';
import type { WorkflowGraph, WorkflowNode } from '../common/types/graph';
import type { GraphProblem } from '../common/types/validation';
import { LLMClientFactory } from '../common/llm/llm-client.factory';
import { DEFAULT_LLM_PROVIDER, isLlmProvider } from '../common/llm/llm.types';

const AGENT_TYPE = 'builtins.Agent';

@Injectable()
export class ByokValidationService {
  constructor(private readonly llmFactory: LLMClientFactory) {}

  async validateGraph(orgId: string, graph: WorkflowGraph): Promise<GraphProblem[]> {
    const agents = graph.nodes.filter((n) => n.type === AGENT_TYPE);
    const checks = await Promise.all(
      agents.map(async (node) => {
        const config = (node.config ?? {}) as Record<string, unknown>;
        const provider = String(config.provider ?? DEFAULT_LLM_PROVIDER);
        if (!isLlmProvider(provider)) return null;
        const cfg = await this.llmFactory.hasValidKey(orgId, provider);
        if (cfg) return null;
        return {
          nodeId: node.id,
          field: 'provider',
          code: 'MISSING_LLM_KEY' as const,
          message: `Add your ${provider} API key in Settings → LLM Keys before running this workflow.`,
          severity: 'error' as const,
        };
      }),
    );
    return checks.filter((p) => p !== null) as GraphProblem[];
  }

  findAgentNodes(graph: WorkflowGraph): WorkflowNode[] {
    return graph.nodes.filter((n) => n.type === AGENT_TYPE);
  }
}
