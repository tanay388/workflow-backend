/** xyflow ⇄ TRD §5 edge/node mapping (tested boundary helper). */

export interface FlowNodeLike {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: { label?: string; nodeType?: string; config?: Record<string, unknown> };
}

export interface FlowEdgeLike {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface PersistedEdge {
  id: string;
  source_node_id: string;
  source_port_id: string;
  target_node_id: string;
  target_port_id: string;
}

export function edgesToPersisted(edges: FlowEdgeLike[]): PersistedEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source_node_id: e.source,
    source_port_id: e.sourceHandle ?? 'out',
    target_node_id: e.target,
    target_port_id: e.targetHandle ?? 'in',
  }));
}

export function edgesFromPersisted(edges: PersistedEdge[]): FlowEdgeLike[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    sourceHandle: e.source_port_id,
    targetHandle: e.target_port_id,
  }));
}

export function nodesToPersisted(nodes: FlowNodeLike[]) {
  return nodes.map((n) => ({
    id: n.id,
    type: n.data.nodeType ?? String(n.type),
    label: n.data.label ?? n.id,
    config: n.data.config ?? {},
    position: n.position,
  }));
}

export function nodesFromPersisted(
  nodes: ReturnType<typeof nodesToPersisted>,
): FlowNodeLike[] {
  return nodes.map((n) => ({
    id: n.id,
    type: 'workflow',
    position: n.position,
    data: { label: n.label, nodeType: n.type, config: n.config },
  }));
}
