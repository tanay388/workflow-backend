import type { JsonSchema } from '../common/types/json-schema';

export function validateConfigAgainstSchema(
  schema: JsonSchema,
  config: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const required = schema.required ?? [];

  for (const key of required) {
    const val = config[key];
    if (val === undefined || val === null || val === '') {
      errors.push(`Missing required field "${key}"`);
    }
  }

  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const val = config[key];
    if (val === undefined || val === null) continue;

    if (prop.enum?.length && typeof val === 'string' && !prop.enum.includes(val)) {
      errors.push(`Field "${key}" must be one of: ${prop.enum.join(', ')}`);
    }
    if (prop.type === 'number' && typeof val !== 'number') {
      errors.push(`Field "${key}" must be a number`);
    }
    if (prop.type === 'integer' && typeof val !== 'number') {
      errors.push(`Field "${key}" must be an integer`);
    }
    if (prop.type === 'boolean' && typeof val !== 'boolean') {
      errors.push(`Field "${key}" must be a boolean`);
    }
    if (prop.type === 'string' && typeof val !== 'string') {
      errors.push(`Field "${key}" must be a string`);
    }
  }

  return errors;
}

/** Collect all string values from config (including nested) for expression scanning. */
export function collectConfigStrings(
  config: Record<string, unknown>,
  prefix = '',
): Array<{ field: string; value: string }> {
  const out: Array<{ field: string; value: string }> = [];
  for (const [key, val] of Object.entries(config)) {
    const field = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'string') {
      out.push({ field, value: val });
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      out.push(...collectConfigStrings(val as Record<string, unknown>, field));
    }
  }
  return out;
}
