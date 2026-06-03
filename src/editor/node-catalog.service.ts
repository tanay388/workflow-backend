import { Injectable } from '@nestjs/common';
import type { JsonSchema } from '../common/types/json-schema';
import type { NodeTypeDescriptor } from '../common/types/validation';
import type { WorkflowGraph } from '../common/types/graph';
import { BUILTIN_NODE_TYPES, getBuiltinNodeType } from './node-catalog.registry';

@Injectable()
export class NodeCatalogService {
  listAll(): NodeTypeDescriptor[] {
    return BUILTIN_NODE_TYPES.map((n) => ({ ...n }));
  }

  get(key: string): NodeTypeDescriptor | undefined {
    return getBuiltinNodeType(key);
  }

  /** Start node output mirrors graph.input_schema; other types use static catalog schema. */
  resolveOutputSchema(nodeType: string, graph?: WorkflowGraph): JsonSchema {
    if (nodeType === 'builtins.Start' && graph?.input_schema) {
      const schema = graph.input_schema as JsonSchema;
      return {
        type: 'object',
        title: 'Workflow input',
        properties: schema.properties ?? {},
      };
    }
    return getBuiltinNodeType(nodeType)?.outputSchema ?? { type: 'object', properties: {} };
  }

  isConfigOnly(nodeType: string): boolean {
    return Boolean(getBuiltinNodeType(nodeType)?.configOnly);
  }

  isExecutionNode(nodeType: string): boolean {
    const t = getBuiltinNodeType(nodeType);
    return Boolean(t && !t.configOnly);
  }
}
