import { BadRequestException } from '@nestjs/common';
import type { FormFieldSchema, FormFieldType } from './entities/form.entity';
import { ensureNameFieldFirst } from './required-name-field';

const FIELD_TYPES = new Set<FormFieldType>([
  'text',
  'email',
  'phone',
  'number',
  'select',
  'checkbox',
  'date',
  'long-text',
]);

export function assertValidFormSchema(schema: unknown): FormFieldSchema[] {
  if (!Array.isArray(schema)) {
    throw new BadRequestException('Form schema must be an array of fields');
  }
  const keys = new Set<string>();
  const out: FormFieldSchema[] = [];
  for (const raw of schema) {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestException('Invalid form field');
    }
    const f = raw as FormFieldSchema;
    if (!f.key?.trim() || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(f.key)) {
      throw new BadRequestException(`Invalid field key: ${f.key}`);
    }
    if (keys.has(f.key)) {
      throw new BadRequestException(`Duplicate field key: ${f.key}`);
    }
    keys.add(f.key);
    if (!f.label?.trim()) {
      throw new BadRequestException(`Field ${f.key} requires a label`);
    }
    if (!FIELD_TYPES.has(f.type)) {
      throw new BadRequestException(`Invalid field type for ${f.key}`);
    }
    if (f.type === 'select' && (!f.options?.length)) {
      throw new BadRequestException(`Select field ${f.key} requires options`);
    }
    out.push({
      key: f.key,
      label: f.label.trim(),
      type: f.type,
      required: Boolean(f.required),
      placeholder: f.placeholder?.trim(),
      options: f.options,
      validation: f.validation,
    });
  }
  return ensureNameFieldFirst(out);
}

export function validateSubmission(
  schema: FormFieldSchema[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of schema) {
    const value = data[field.key];
    if (value === undefined || value === null || value === '') {
      if (field.required) {
        throw new BadRequestException(`${field.label} is required`);
      }
      continue;
    }
    out[field.key] = coerceFieldValue(field, value);
  }
  return out;
}

function coerceFieldValue(field: FormFieldSchema, value: unknown): unknown {
  switch (field.type) {
    case 'checkbox':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === '1' || value === 1) return true;
      if (value === 'false' || value === '0' || value === 0) return false;
      throw fieldError(field, 'must be true or false');
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) throw fieldError(field, 'must be a number');
      if (field.validation?.min != null && n < field.validation.min) {
        throw fieldError(field, `must be at least ${field.validation.min}`);
      }
      if (field.validation?.max != null && n > field.validation.max) {
        throw fieldError(field, `must be at most ${field.validation.max}`);
      }
      return n;
    }
    case 'email': {
      const s = String(value).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw fieldError(field, 'invalid email');
      return s;
    }
    case 'phone': {
      const s = String(value).trim();
      if (!/^[\d\s+().-]{7,}$/.test(s)) throw fieldError(field, 'invalid phone');
      return s;
    }
    case 'date': {
      const s = String(value).trim();
      if (Number.isNaN(Date.parse(s))) throw fieldError(field, 'invalid date');
      return s;
    }
    case 'select': {
      const s = String(value).trim();
      if (!field.options?.includes(s)) throw fieldError(field, 'invalid option');
      return s;
    }
    default: {
      const s = String(value).trim();
      if (field.validation?.minLength != null && s.length < field.validation.minLength) {
        throw fieldError(field, `must be at least ${field.validation.minLength} characters`);
      }
      if (field.validation?.maxLength != null && s.length > field.validation.maxLength) {
        throw fieldError(field, `must be at most ${field.validation.maxLength} characters`);
      }
      if (field.validation?.pattern) {
        try {
          if (!new RegExp(field.validation.pattern).test(s)) {
            throw fieldError(field, 'invalid format');
          }
        } catch {
          // ignore invalid regex in schema
        }
      }
      return s;
    }
  }
}

function fieldError(field: FormFieldSchema, detail: string): BadRequestException {
  return new BadRequestException(`${field.label} ${detail}`);
}
