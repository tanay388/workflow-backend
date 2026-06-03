import { Test } from '@nestjs/testing';
import { NodeCatalogService } from '../editor/node-catalog.service';
import { OutputSchemaService } from './output-schema.service';

describe('OutputSchemaService', () => {
  let svc: OutputSchemaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [OutputSchemaService],
    }).compile();
    svc = module.get(OutputSchemaService);
  });

  it('flattens nested object schema', () => {
    const fields = svc.flatten(
      {
        type: 'object',
        properties: {
          text: { type: 'string', title: 'Text' },
          meta: {
            type: 'object',
            properties: { count: { type: 'integer', title: 'Count' } },
          },
        },
      },
      'output',
      'node.Agent.output',
    );
    expect(fields.some((f) => f.path === 'output.text')).toBe(true);
    expect(fields.some((f) => f.path === 'output.meta.count')).toBe(true);
  });
});

describe('NodeCatalogService', () => {
  it('lists all built-in types with schemas', () => {
    const svc = new NodeCatalogService();
    const all = svc.listAll();
    expect(all.length).toBeGreaterThan(5);
    for (const t of all) {
      expect(t.configSchema).toBeDefined();
      expect(t.outputSchema).toBeDefined();
    }
  });
});
