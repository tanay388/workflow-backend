import type { FormFieldSchema } from './entities/form.entity';

/** System field key — always required as the first form field for widget leads. */
export const VISITOR_NAME_FIELD_KEY = 'name';

export function requiredNameField(): FormFieldSchema {
  return {
    key: VISITOR_NAME_FIELD_KEY,
    label: 'Your name',
    type: 'text',
    required: true,
    placeholder: 'Enter your name',
  };
}

export function isRequiredNameField(field: FormFieldSchema): boolean {
  return field.key === VISITOR_NAME_FIELD_KEY;
}

/** Ensures the name field is first, required, and cannot be removed from published schemas. */
export function ensureNameFieldFirst(schema: FormFieldSchema[]): FormFieldSchema[] {
  const rest = schema.filter((f) => f.key !== VISITOR_NAME_FIELD_KEY);
  const existing = schema.find((f) => f.key === VISITOR_NAME_FIELD_KEY);
  const nameField: FormFieldSchema = {
    ...requiredNameField(),
    ...(existing ?? {}),
    key: VISITOR_NAME_FIELD_KEY,
    type: 'text',
    required: true,
    label: existing?.label?.trim() || requiredNameField().label,
  };
  return [nameField, ...rest];
}

export function leadDisplayName(
  data: Record<string, unknown>,
  fallback?: string | null,
): string | null {
  const fromData = data[VISITOR_NAME_FIELD_KEY];
  if (typeof fromData === 'string' && fromData.trim()) return fromData.trim();
  if (fallback?.trim()) return fallback.trim();
  return null;
}

export function visitorDomainFromMeta(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  if (!meta || typeof meta !== 'object') return null;
  for (const key of ['lastHost', 'pageHost', 'firstHost', 'lastOrigin']) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) {
      if (key === 'lastOrigin') {
        try {
          return new URL(v).hostname;
        } catch {
          return v;
        }
      }
      return v.trim();
    }
  }
  return null;
}
