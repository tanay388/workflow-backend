import { assertValidFormSchema, validateSubmission } from './form-schema.validator';
import type { FormFieldSchema } from './entities/form.entity';

describe('form schema validation', () => {
  const schema: FormFieldSchema[] = [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'email', label: 'Email', type: 'email', required: true },
    { key: 'topic', label: 'Topic', type: 'select', required: false, options: ['A', 'B'] },
  ];

  it('validates required fields', () => {
    expect(() => validateSubmission(schema, { name: 'Ada' })).toThrow();
  });

  it('accepts valid submission', () => {
    const data = validateSubmission(schema, {
      name: 'Ada',
      email: 'ada@example.com',
      topic: 'A',
    });
    expect(data.email).toBe('ada@example.com');
  });

  it('rejects duplicate keys in schema', () => {
    expect(() =>
      assertValidFormSchema([
        { key: 'a', label: 'A', type: 'text' },
        { key: 'a', label: 'B', type: 'text' },
      ]),
    ).toThrow();
  });
});
