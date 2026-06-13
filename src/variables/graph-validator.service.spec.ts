import { Test } from '@nestjs/testing';
import { NodeCatalogService } from '../editor/node-catalog.service';
import { createEmptyGraph } from '../common/types/graph';
import { ExpressionService } from './expression.service';
import { GraphValidatorService } from './graph-validator.service';
import { OutputSchemaService } from './output-schema.service';
import { UpstreamGraphService } from './upstream-graph.service';

describe('GraphValidatorService', () => {
  let validator: GraphValidatorService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GraphValidatorService,
        NodeCatalogService,
        UpstreamGraphService,
        OutputSchemaService,
        ExpressionService,
      ],
    }).compile();
    validator = module.get(GraphValidatorService);
  });

  it('flags missing Start', () => {
    const g = createEmptyGraph();
    g.nodes = [];
    const result = validator.validate(g);
    expect(result.valid).toBe(false);
    expect(result.problems.some((p) => p.code === 'MISSING_START')).toBe(true);
  });

  it('accepts multi-branch If/Else output ports', () => {
    const g = createEmptyGraph();
    g.nodes.push(
      {
        id: 'n_if',
        type: 'builtins.IfElse',
        label: 'Brancher',
        config: {
          conditionMode: 'multi',
          conditions: [
            { id: 'vip', label: 'VIP', condition: '{{ vars.tier }} == "vip"', type: 'if' },
            { id: 'else', label: 'Otherwise', type: 'else' },
          ],
        },
        position: { x: 200, y: 0 },
      },
      {
        id: 'n_vip',
        type: 'builtins.Agent',
        label: 'VIP Agent',
        config: { instructions: 'x', provider: 'openai', model: 'gpt-4o' },
        position: { x: 400, y: -40 },
      },
      {
        id: 'n_other',
        type: 'builtins.Agent',
        label: 'Other Agent',
        config: { instructions: 'x', provider: 'openai', model: 'gpt-4o' },
        position: { x: 400, y: 40 },
      },
    );
    g.edges.push(
      {
        id: 'e1',
        source_node_id: 'n_start',
        source_port_id: 'out',
        target_node_id: 'n_if',
        target_port_id: 'in',
      },
      {
        id: 'e2',
        source_node_id: 'n_if',
        source_port_id: 'vip',
        target_node_id: 'n_vip',
        target_port_id: 'in',
      },
      {
        id: 'e3',
        source_node_id: 'n_if',
        source_port_id: 'else',
        target_node_id: 'n_other',
        target_port_id: 'in',
      },
    );
    const result = validator.validate(g);
    expect(result.problems.some((p) => p.code === 'DANGLING_PORT' && p.severity === 'error')).toBe(
      false,
    );
  });

  it('warns on unwired Wait timed_out port in event mode', () => {
    const g = createEmptyGraph();
    g.nodes.push({
      id: 'n_wait',
      type: 'builtins.Wait',
      label: 'Wait',
      config: {
        mode: 'until_event',
        event: { toolkit: 'github', event_slug: 'ISSUE_OPENED', timeout_minutes: 60 },
      },
      position: { x: 200, y: 0 },
    });
    g.edges.push({
      id: 'e1',
      source_node_id: 'n_start',
      source_port_id: 'out',
      target_node_id: 'n_wait',
      target_port_id: 'in',
    });
    const result = validator.validate(g);
    expect(
      result.problems.some(
        (p) =>
          p.severity === 'warning' &&
          p.nodeId === 'n_wait' &&
          p.message.includes('Timed out'),
      ),
    ).toBe(true);
  });

  it('flags forward reference in config', () => {
    const g = createEmptyGraph();
    g.nodes.push({
      id: 'n_agent',
      type: 'builtins.Agent',
      label: 'Agent',
      config: { instructions: '{{ node.Downstream.output.text }}', provider: 'openai', model: 'gpt-4o' },
      position: { x: 200, y: 0 },
    });
    g.nodes.push({
      id: 'n_down',
      type: 'builtins.Agent',
      label: 'Downstream',
      config: { instructions: 'x', provider: 'openai', model: 'gpt-4o' },
      position: { x: 400, y: 0 },
    });
    g.edges.push({
      id: 'e1',
      source_node_id: 'n_start',
      source_port_id: 'out',
      target_node_id: 'n_agent',
      target_port_id: 'in',
    });
    const result = validator.validate(g);
    expect(result.problems.some((p) => p.code === 'FORWARD_REFERENCE')).toBe(true);
  });
});
