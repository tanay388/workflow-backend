import { Injectable, NotFoundException } from '@nestjs/common';
import type { WorkflowGraph } from '../common/types/graph';
import type { NodeVariablesResponse } from '../common/types/validation';
import { NodeCatalogService } from '../editor/node-catalog.service';
import { getWorkflowParameters } from '../common/utils/workflow-variables';
import { OutputSchemaService } from './output-schema.service';
import { UpstreamGraphService } from './upstream-graph.service';

@Injectable()
export class VariablesService {
  constructor(
    private readonly catalog: NodeCatalogService,
    private readonly upstream: UpstreamGraphService,
    private readonly outputSchema: OutputSchemaService,
  ) {}

  getVariablesForNode(graph: WorkflowGraph, nodeId: string): NodeVariablesResponse {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) throw new NotFoundException('Node not found');

    const upstream = this.upstream.getUpstreamNodes(graph, nodeId).map((n) => {
      const schema = this.catalog.resolveOutputSchema(n.type, graph);
      const fields = this.outputSchema.flatten(
        schema,
        'output',
        `node.${n.label}.output`,
      );
      return {
        nodeId: n.id,
        label: n.label,
        type: n.type,
        fields,
      };
    });

    // Unified namespace: all declared parameters surface once under `vars`
    // (the canonical insert form); `input.*` remains a runtime alias.
    const varsFields = getWorkflowParameters(graph).map((p) => ({
      path: p.key,
      type: p.type,
      sample: p.default ?? null,
      insertText: `{{ vars.${p.key} }}`,
    }));

    return {
      nodeId,
      upstream,
      namespaces: {
        input: [],
        inputForm: [],
        vars: varsFields,
      },
    };
  }
}
