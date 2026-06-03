import { Injectable, NotFoundException } from '@nestjs/common';
import type { WorkflowGraph } from '../common/types/graph';
import type { NodeVariablesResponse } from '../common/types/validation';
import { NodeCatalogService } from '../editor/node-catalog.service';
import { getWorkflowVarDefinitions } from '../common/utils/workflow-variables';
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

    const inputSchema = this.catalog.resolveOutputSchema('builtins.Start', graph);
    const inputFields = this.outputSchema.flatten(inputSchema, '', 'input');
    const varDefs = getWorkflowVarDefinitions(graph);
    const varsFields = Object.entries(varDefs).map(([name, def]) => ({
      path: name,
      type: def.type,
      sample: def.default ?? null,
      insertText: `{{ vars.${name} }}`,
    }));

    return {
      nodeId,
      upstream,
      namespaces: {
        input: inputFields,
        inputForm: [],
        vars:
          varsFields.length > 0
            ? varsFields
            : [
                {
                  path: '*',
                  type: 'unknown',
                  sample: null,
                  insertText: '{{ vars.<name> }}',
                },
              ],
      },
    };
  }
}
