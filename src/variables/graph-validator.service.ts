import { Injectable } from '@nestjs/common';
import type { WorkflowGraph, WorkflowNode } from '../common/types/graph';
import type { GraphProblem, GraphValidationResult } from '../common/types/validation';
import { NodeCatalogService } from '../editor/node-catalog.service';
import { collectConfigStrings, validateConfigAgainstSchema } from './config-validator';
import { ExpressionService } from './expression.service';
import { OutputSchemaService } from './output-schema.service';
import { getWorkflowVarDefinitions } from '../common/utils/workflow-variables';
import { UpstreamGraphService } from './upstream-graph.service';

const START_TYPE = 'builtins.Start';

@Injectable()
export class GraphValidatorService {
  constructor(
    private readonly catalog: NodeCatalogService,
    private readonly upstream: UpstreamGraphService,
    private readonly outputSchema: OutputSchemaService,
    private readonly expressions: ExpressionService,
  ) {}

  validate(graph: WorkflowGraph): GraphValidationResult {
    const problems: GraphProblem[] = [];
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

    this.validateStructure(graph, nodeById, problems);
    this.validateReachability(graph, nodeById, problems);
    this.validatePorts(graph, nodeById, problems);

    for (const node of graph.nodes) {
      this.validateNodeConfig(graph, node, problems);
    }

    return { valid: problems.every((p) => p.severity !== 'error'), problems };
  }

  private validateStructure(
    graph: WorkflowGraph,
    nodeById: Map<string, WorkflowNode>,
    problems: GraphProblem[],
  ) {
    const seenIds = new Set<string>();
    const labels = new Map<string, string>();

    for (const node of graph.nodes) {
      if (seenIds.has(node.id)) {
        problems.push({
          nodeId: node.id,
          field: null,
          code: 'DUPLICATE_NODE_ID',
          message: `Duplicate node id "${node.id}"`,
          severity: 'error',
        });
      }
      seenIds.add(node.id);

      const prev = labels.get(node.label);
      if (prev && prev !== node.id) {
        problems.push({
          nodeId: node.id,
          field: 'label',
          code: 'DUPLICATE_NODE_LABEL',
          message: `Duplicate node label "${node.label}"`,
          severity: 'error',
        });
      }
      labels.set(node.label, node.id);
    }

    const starts = graph.nodes.filter((n) => n.type === START_TYPE);
    if (starts.length === 0) {
      problems.push({
        nodeId: null,
        field: null,
        code: 'MISSING_START',
        message: 'Workflow must contain exactly one Start node',
        severity: 'error',
      });
    } else if (starts.length > 1) {
      for (const n of starts) {
        problems.push({
          nodeId: n.id,
          field: null,
          code: 'MULTIPLE_START',
          message: 'Workflow must contain exactly one Start node',
          severity: 'error',
        });
      }
    }

    for (const edge of graph.edges) {
      if (!nodeById.has(edge.source_node_id)) {
        problems.push({
          nodeId: edge.source_node_id,
          field: null,
          code: 'MISSING_EDGE_NODE',
          message: `Edge references missing source node "${edge.source_node_id}"`,
          severity: 'error',
        });
      }
      if (!nodeById.has(edge.target_node_id)) {
        problems.push({
          nodeId: edge.target_node_id,
          field: null,
          code: 'MISSING_EDGE_NODE',
          message: `Edge references missing target node "${edge.target_node_id}"`,
          severity: 'error',
        });
      }
    }
  }

  private validateReachability(
    graph: WorkflowGraph,
    nodeById: Map<string, WorkflowNode>,
    problems: GraphProblem[],
  ) {
    const reachable = this.upstream.getReachableFromStart(graph);
    for (const node of graph.nodes) {
      if (!this.catalog.isExecutionNode(node.type)) continue;
      if (!reachable.has(node.id)) {
        problems.push({
          nodeId: node.id,
          field: null,
          code: 'UNREACHABLE_NODE',
          message: `Node "${node.label}" is not reachable from Start`,
          severity: 'error',
        });
      }
    }

    const outgoing = new Map<string, number>();
    for (const edge of graph.edges) {
      outgoing.set(edge.source_node_id, (outgoing.get(edge.source_node_id) ?? 0) + 1);
    }

    const hasTerminal = graph.nodes.some(
      (n) =>
        this.catalog.isExecutionNode(n.type) &&
        reachable.has(n.id) &&
        (outgoing.get(n.id) ?? 0) === 0,
    );
    if (!hasTerminal && graph.nodes.some((n) => n.type === START_TYPE)) {
      problems.push({
        nodeId: null,
        field: null,
        code: 'NO_TERMINAL',
        message: 'At least one reachable terminal node (no outgoing edges) is required',
        severity: 'error',
      });
    }
  }

  private validatePorts(
    graph: WorkflowGraph,
    nodeById: Map<string, WorkflowNode>,
    problems: GraphProblem[],
  ) {
    const incoming = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
      const set = incoming.get(edge.target_node_id) ?? new Set();
      set.add(edge.target_port_id);
      incoming.set(edge.target_node_id, set);
    }

    for (const node of graph.nodes) {
      const typeDef = this.catalog.get(node.type);
      if (!typeDef || typeDef.configOnly) continue;

      for (const port of typeDef.inputs) {
        if (!port.required) continue;
        const hasIncoming = graph.edges.some(
          (e) => e.target_node_id === node.id && e.target_port_id === port.id,
        );
        if (!hasIncoming && node.type !== START_TYPE) {
          problems.push({
            nodeId: node.id,
            field: null,
            code: 'DANGLING_PORT',
            message: `Required input port "${port.id}" on "${node.label}" is not connected`,
            severity: 'error',
          });
        }
      }
    }

    for (const edge of graph.edges) {
      const src = nodeById.get(edge.source_node_id);
      const tgt = nodeById.get(edge.target_node_id);
      if (!src || !tgt) continue;
      const srcDef = this.catalog.get(src.type);
      const tgtDef = this.catalog.get(tgt.type);
      if (srcDef && !srcDef.outputs.some((p) => p.id === edge.source_port_id)) {
        problems.push({
          nodeId: src.id,
          field: null,
          code: 'DANGLING_PORT',
          message: `Unknown output port "${edge.source_port_id}" on "${src.label}"`,
          severity: 'error',
        });
      }
      if (tgtDef && tgtDef.inputs.length && !tgtDef.inputs.some((p) => p.id === edge.target_port_id)) {
        problems.push({
          nodeId: tgt.id,
          field: null,
          code: 'DANGLING_PORT',
          message: `Unknown input port "${edge.target_port_id}" on "${tgt.label}"`,
          severity: 'error',
        });
      }
    }
  }

  private validateNodeConfig(graph: WorkflowGraph, node: WorkflowNode, problems: GraphProblem[]) {
    const typeDef = this.catalog.get(node.type);
    if (!typeDef) return;

    const configErrors = validateConfigAgainstSchema(
      typeDef.configSchema,
      node.config ?? {},
    );
    for (const msg of configErrors) {
      problems.push({
        nodeId: node.id,
        field: null,
        code: 'INVALID_CONFIG',
        message: msg,
        severity: 'error',
      });
    }

    if (typeDef.configOnly) return;

    const upstreamIds = this.upstream.getUpstreamIds(graph, node.id);
    const namespace = this.buildNamespace(graph, node.id, upstreamIds);

    for (const { field, value } of collectConfigStrings(node.config ?? {})) {
      for (const expr of this.expressions.extractExpressions(value)) {
        const ref = this.expressions.parseExpression(expr);
        if (!ref) {
          problems.push({
            nodeId: node.id,
            field,
            code: 'INVALID_EXPRESSION',
            message: `Invalid or unsafe expression "{{ ${expr} }}"`,
            severity: 'error',
          });
          continue;
        }
        const resolved = this.expressions.resolveType(ref, namespace);
        if (!resolved.ok) {
          problems.push({
            nodeId: node.id,
            field,
            code: ref.kind === 'node' ? 'FORWARD_REFERENCE' : 'UNKNOWN_VARIABLE',
            message: resolved.reason ?? 'Invalid variable reference',
            severity: 'error',
          });
        }
      }
    }
  }

  buildNamespace(
    graph: WorkflowGraph,
    targetNodeId: string,
    upstreamIds: Set<string>,
  ) {
    const inputFields = new Set<string>();
    const inputSchema = graph.input_schema as { properties?: Record<string, unknown> };
    for (const key of Object.keys(inputSchema?.properties ?? {})) {
      inputFields.add(key);
    }

    const varsFields = new Set(Object.keys(getWorkflowVarDefinitions(graph)));

    const upstreamNodeRefs = new Map<string, Set<string>>();
    for (const node of graph.nodes) {
      if (!upstreamIds.has(node.id)) continue;
      const schema = this.catalog.resolveOutputSchema(node.type, graph);
      const flat = this.outputSchema.flatten(
        schema,
        'output',
        `node.${node.label}.output`,
      );
      const fields = new Set(flat.map((f) => f.path.replace(/^output\./, '')));
      upstreamNodeRefs.set(node.label, fields);
      upstreamNodeRefs.set(node.id, fields);
    }

    return {
      inputFields,
      inputFormFields: new Set<string>(),
      varsFields,
      upstreamNodeRefs,
    };
  }
}
