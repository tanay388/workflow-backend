import { Injectable } from '@nestjs/common';
import type { JsonSchema, JsonSchemaProperty } from '../common/types/json-schema';
import type { FlatVariableField } from '../common/types/validation';

@Injectable()
export class OutputSchemaService {
  flatten(
    outputSchema: JsonSchema,
    prefix: string,
    insertPrefix: string,
  ): FlatVariableField[] {
    const fields: FlatVariableField[] = [];
    this.walk(outputSchema, prefix, insertPrefix, fields);
    return fields;
  }

  private walk(
    schema: JsonSchema | JsonSchemaProperty,
    path: string,
    insertPath: string,
    out: FlatVariableField[],
  ) {
    const props = schema.properties ?? {};
    for (const [key, prop] of Object.entries(props)) {
      const fullPath = path ? `${path}.${key}` : key;
      const insertFull = insertPath ? `${insertPath}.${key}` : key;
      const type = prop.type ?? 'unknown';

      if (type === 'object' && prop.properties) {
        this.walk(prop, fullPath, insertFull, out);
      } else if (type === 'array') {
        out.push({
          path: fullPath,
          type: 'array',
          sample: [],
          insertText: `{{ ${insertFull} }}`,
        });
      } else {
        out.push({
          path: fullPath,
          type,
          sample: this.sampleForType(type),
          insertText: `{{ ${insertFull} }}`,
        });
      }
    }
  }

  sampleForType(type: string): unknown {
    switch (type) {
      case 'string':
        return 'example';
      case 'number':
      case 'integer':
        return 0;
      case 'boolean':
        return false;
      default:
        return null;
    }
  }
}
