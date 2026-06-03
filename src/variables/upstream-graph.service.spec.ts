import { Test } from '@nestjs/testing';
import { NodeCatalogService } from '../editor/node-catalog.service';
import type { WorkflowGraph } from '../common/types/graph';
import { UpstreamGraphService } from './upstream-graph.service';

describe('UpstreamGraphService', () => {
  let svc: UpstreamGraphService;

  const graph: WorkflowGraph = {
    input_schema: { type: 'object', properties: {} },
    nodes: [
      { id: 'a', type: 'builtins.Start', label: 'Start', config: {}, position: { x: 0, y: 0 } },
      { id: 'b', type: 'builtins.Agent', label: 'Agent', config: {}, position: { x: 0, y: 0 } },
      { id: 'c', type: 'builtins.Agent', label: 'Agent2', config: {}, position: { x: 0, y: 0 } },
      { id: 'd', type: 'builtins.Agent', label: 'Parallel', config: {}, position: { x: 0, y: 0 } },
    ],
    edges: [
      { id: 'e1', source_node_id: 'a', source_port_id: 'out', target_node_id: 'b', target_port_id: 'in' },
      { id: 'e2', source_node_id: 'b', source_port_id: 'out', target_node_id: 'c', target_port_id: 'in' },
    ],
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UpstreamGraphService, NodeCatalogService],
    }).compile();
    svc = module.get(UpstreamGraphService);
  });

  it('returns ordered upstream for linear chain', () => {
    const up = svc.getUpstreamNodes(graph, 'c');
    expect(up.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('excludes parallel branch not feeding target', () => {
    const up = svc.getUpstreamNodes(graph, 'c');
    expect(up.some((n) => n.id === 'd')).toBe(false);
  });
});
