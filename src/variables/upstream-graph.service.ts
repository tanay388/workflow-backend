import { Injectable } from '@nestjs/common';
import type { WorkflowGraph, WorkflowNode } from '../common/types/graph';
import { NodeCatalogService } from '../editor/node-catalog.service';

@Injectable()
export class UpstreamGraphService {
  constructor(private readonly catalog: NodeCatalogService) {}

  /** Reverse BFS from target — ordered transitive predecessors (execution nodes only). */
  getUpstreamNodes(graph: WorkflowGraph, targetNodeId: string): WorkflowNode[] {
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const target = nodeById.get(targetNodeId);
    if (!target) return [];

    const reverseAdj = new Map<string, string[]>();
    for (const edge of graph.edges) {
      const list = reverseAdj.get(edge.target_node_id) ?? [];
      list.push(edge.source_node_id);
      reverseAdj.set(edge.target_node_id, list);
    }

    const visited = new Set<string>();
    const queue = [targetNodeId];
    const ordered: WorkflowNode[] = [];

    while (queue.length) {
      const current = queue.shift()!;
      for (const predId of reverseAdj.get(current) ?? []) {
        if (visited.has(predId)) continue;
        visited.add(predId);
        queue.push(predId);
        const pred = nodeById.get(predId);
        if (pred && this.catalog.isExecutionNode(pred.type)) {
          ordered.push(pred);
        }
      }
    }

    return ordered.reverse();
  }

  getUpstreamIds(graph: WorkflowGraph, targetNodeId: string): Set<string> {
    return new Set(this.getUpstreamNodes(graph, targetNodeId).map((n) => n.id));
  }

  /** Forward reachability from Start over execution nodes. */
  getReachableFromStart(graph: WorkflowGraph): Set<string> {
    const start = graph.nodes.find((n) => n.type === 'builtins.Start');
    if (!start) return new Set();

    const forwardAdj = new Map<string, string[]>();
    for (const edge of graph.edges) {
      const list = forwardAdj.get(edge.source_node_id) ?? [];
      list.push(edge.target_node_id);
      forwardAdj.set(edge.source_node_id, list);
    }

    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const visited = new Set<string>();
    const queue = [start.id];

    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const next of forwardAdj.get(id) ?? []) {
        const node = nodeById.get(next);
        if (node && this.catalog.isExecutionNode(node.type)) {
          queue.push(next);
        }
      }
    }
    return visited;
  }
}
