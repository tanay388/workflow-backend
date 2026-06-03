import {
  edgesFromPersisted,
  edgesToPersisted,
  nodesFromPersisted,
  nodesToPersisted,
} from './graph-mapper';

describe('graph-mapper', () => {
  it('round-trips xyflow edges to TRD §5 keys', () => {
    const flow = [
      {
        id: 'e1',
        source: 'n_start',
        target: 'n_agent',
        sourceHandle: 'out',
        targetHandle: 'in',
      },
    ];
    const persisted = edgesToPersisted(flow);
    expect(persisted[0]).toEqual({
      id: 'e1',
      source_node_id: 'n_start',
      source_port_id: 'out',
      target_node_id: 'n_agent',
      target_port_id: 'in',
    });
    expect(edgesFromPersisted(persisted)).toEqual(flow);
  });

  it('defaults missing handles to out/in', () => {
    const persisted = edgesToPersisted([{ id: 'e2', source: 'a', target: 'b' }]);
    expect(persisted[0].source_port_id).toBe('out');
    expect(persisted[0].target_port_id).toBe('in');
  });

  it('round-trips nodes', () => {
    const flow = [
      {
        id: 'n1',
        type: 'workflow',
        position: { x: 10, y: 20 },
        data: { label: 'Agent', nodeType: 'builtins.Agent', config: { model: 'gpt-4o' } },
      },
    ];
    const persisted = nodesToPersisted(flow);
    const back = nodesFromPersisted(persisted);
    expect(back[0].id).toBe('n1');
    expect(back[0].data.nodeType).toBe('builtins.Agent');
    expect(back[0].data.config).toEqual({ model: 'gpt-4o' });
  });
});
