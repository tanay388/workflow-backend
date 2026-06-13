/** Minimal JSON Schema subset for node config + output schemas. */

export interface JsonSchemaProperty {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
  title?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, JsonSchemaProperty>;
  items?: JsonSchemaProperty;
  required?: string[];
}

export interface JsonSchema {
  type?: 'object' | 'string' | 'number' | 'boolean' | 'array';
  title?: string;
  description?: string;
  required?: string[];
  properties?: Record<string, JsonSchemaProperty>;
  items?: JsonSchemaProperty;
}
