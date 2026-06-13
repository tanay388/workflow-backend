import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { normalizeWaitMode } from '../approvals/wait.types';
import { localDateTimeToUtc } from '../common/utils/time';
import type { WorkflowGraph, WorkflowNode } from '../common/types/graph';
import type { GraphProblem, GraphValidationResult } from '../common/types/validation';
import { NodeCatalogService } from '../editor/node-catalog.service';
import { portLabel, resolveNodeOutputPortIds } from '../editor/node-output-ports';
import { collectConfigStrings, validateConfigAgainstSchema } from './config-validator';
import { ExpressionService } from './expression.service';
import { OutputSchemaService } from './output-schema.service';
import { getWorkflowParameters } from '../common/utils/workflow-variables';
import { UpstreamGraphService } from './upstream-graph.service';

interface ConditionRow {
  id?: string;
  label?: string;
  condition?: string;
  type?: string;
}

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
    const reachable = this.upstream.getReachableFromStart(graph);
    this.validateReachability(graph, nodeById, problems, reachable);
    this.validatePorts(graph, nodeById, problems);
    this.validateWhileLoopBodies(graph, reachable, problems);
    this.validateUnwiredOutputPorts(graph, reachable, problems);

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
    reachable: Set<string>,
  ) {
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
      const validOutputs = resolveNodeOutputPortIds(
        src.type,
        src.config,
        srcDef?.outputs,
      );
      if (srcDef && !validOutputs.includes(edge.source_port_id)) {
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

    if (node.type === 'builtins.IfElse') {
      this.validateIfElseConfig(node, problems);
    }
    if (node.type === 'builtins.Wait') {
      this.validateWaitConfig(node, problems);
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

  private validateWhileLoopBodies(
    graph: WorkflowGraph,
    reachable: Set<string>,
    problems: GraphProblem[],
  ) {
    for (const node of graph.nodes) {
      if (node.type !== 'builtins.While' || !reachable.has(node.id)) continue;
      const loopEdge = graph.edges.find(
        (e) => e.source_node_id === node.id && e.source_port_id === 'loop',
      );
      if (!loopEdge) continue;
      if (!this.canReachNode(graph, loopEdge.target_node_id, node.id)) {
        problems.push({
          nodeId: node.id,
          field: 'loop',
          code: 'DANGLING_PORT',
          message: `While "${node.label}": loop body never returns to the loop node`,
          severity: 'warning',
        });
      }
    }
  }

  private validateUnwiredOutputPorts(
    graph: WorkflowGraph,
    reachable: Set<string>,
    problems: GraphProblem[],
  ) {
    for (const node of graph.nodes) {
      if (!this.catalog.isExecutionNode(node.type) || !reachable.has(node.id)) continue;
      const typeDef = this.catalog.get(node.type);
      const ports = resolveNodeOutputPortIds(node.type, node.config, typeDef?.outputs);
      for (const portId of ports) {
        const wired = graph.edges.some(
          (e) => e.source_node_id === node.id && e.source_port_id === portId,
        );
        if (!wired) {
          problems.push({
            nodeId: node.id,
            field: portId,
            code: 'DANGLING_PORT',
            message: `Output port "${portLabel(portId)}" on "${node.label}" is not connected — the run will end if this branch is taken`,
            severity: 'warning',
          });
        }
      }
    }
  }

  private canReachNode(graph: WorkflowGraph, fromId: string, toId: string): boolean {
    const visited = new Set<string>();
    const queue = [fromId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === toId) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const edge of graph.edges) {
        if (edge.source_node_id === cur) {
          queue.push(edge.target_node_id);
        }
      }
    }
    return false;
  }

  private validateIfElseConfig(node: WorkflowNode, problems: GraphProblem[]) {
    const config = node.config ?? {};
    const mode = String(config.conditionMode ?? 'simple');
    if (mode !== 'multi' || !Array.isArray(config.conditions)) return;

    const rows = config.conditions as ConditionRow[];
    const ids = new Set<string>();
    let elseCount = 0;
    let elseIndex = -1;

    rows.forEach((row, index) => {
      const id = row.id?.trim();
      if (!id) {
        problems.push({
          nodeId: node.id,
          field: `conditions[${index}].id`,
          code: 'INVALID_CONFIG',
          message: `If/Else branch ${index + 1} is missing a unique id`,
          severity: 'error',
        });
      } else if (ids.has(id)) {
        problems.push({
          nodeId: node.id,
          field: `conditions[${index}].id`,
          code: 'INVALID_CONFIG',
          message: `Duplicate If/Else branch id "${id}"`,
          severity: 'error',
        });
      } else {
        ids.add(id);
      }

      if (row.type === 'else') {
        elseCount++;
        elseIndex = index;
      } else if (!row.condition?.trim()) {
        problems.push({
          nodeId: node.id,
          field: `conditions[${index}].condition`,
          code: 'INVALID_CONFIG',
          message: `If/Else branch "${row.label ?? id ?? index + 1}" is missing a condition`,
          severity: 'error',
        });
      }
    });

    if (elseCount > 1) {
      problems.push({
        nodeId: node.id,
        field: 'conditions',
        code: 'INVALID_CONFIG',
        message: 'If/Else multi mode allows at most one "else" branch',
        severity: 'error',
      });
    }
    if (elseCount === 1 && elseIndex >= 0 && elseIndex !== rows.length - 1) {
      problems.push({
        nodeId: node.id,
        field: 'conditions',
        code: 'INVALID_CONFIG',
        message: 'If/Else "else" branch must be the last row',
        severity: 'error',
      });
    }
  }

  private validateWaitConfig(node: WorkflowNode, problems: GraphProblem[]) {
    const config = node.config ?? {};
    const mode = normalizeWaitMode(String(config.mode ?? 'delay'));

    if (mode === 'until_datetime') {
      const until = (config.until as { datetime?: string; timezone?: string }) ?? {};
      const datetime = String(until.datetime ?? '').trim();
      const timezone = String(until.timezone ?? 'UTC').trim();
      if (!datetime) {
        problems.push({
          nodeId: node.id,
          field: 'until.datetime',
          code: 'INVALID_CONFIG',
          message: 'Wait "until datetime" requires a datetime value',
          severity: 'error',
        });
        return;
      }
      if (!DateTime.now().setZone(timezone).isValid) {
        problems.push({
          nodeId: node.id,
          field: 'until.timezone',
          code: 'INVALID_CONFIG',
          message: `Invalid IANA timezone "${timezone}"`,
          severity: 'error',
        });
        return;
      }
      try {
        const resumeAt = localDateTimeToUtc(datetime, timezone);
        if (resumeAt.getTime() <= Date.now()) {
          problems.push({
            nodeId: node.id,
            field: 'until.datetime',
            code: 'INVALID_CONFIG',
            message: 'Wait until datetime must be in the future',
            severity: 'warning',
          });
        }
      } catch (err) {
        problems.push({
          nodeId: node.id,
          field: 'until.datetime',
          code: 'INVALID_CONFIG',
          message: err instanceof Error ? err.message : 'Invalid datetime',
          severity: 'error',
        });
      }
    }

    if (mode === 'until_event') {
      const event = (config.event as Record<string, unknown>) ?? {};
      if (!String(event.toolkit ?? '').trim()) {
        problems.push({
          nodeId: node.id,
          field: 'event.toolkit',
          code: 'INVALID_CONFIG',
          message: 'Wait "until event" requires a toolkit',
          severity: 'error',
        });
      }
      if (!String(event.event_slug ?? '').trim()) {
        problems.push({
          nodeId: node.id,
          field: 'event.event_slug',
          code: 'INVALID_CONFIG',
          message: 'Wait "until event" requires an event slug',
          severity: 'error',
        });
      }
      const connectionId =
        typeof event.connection_id === 'string' ? event.connection_id.trim() : '';
      if (!connectionId) {
        problems.push({
          nodeId: node.id,
          field: 'event.connection_id',
          code: 'INVALID_CONFIG',
          message:
            'Wait "until event" requires a connected account — the trigger is registered on it when the run pauses',
          severity: 'error',
        });
      }
    }
  }

  buildNamespace(
    graph: WorkflowGraph,
    targetNodeId: string,
    upstreamIds: Set<string>,
  ) {
    // Unified namespace: `input.*` and `vars.*` are aliases over the same
    // declared parameters.
    const paramKeys = getWorkflowParameters(graph).map((p) => p.key);
    const inputFields = new Set<string>(paramKeys);
    const varsFields = new Set<string>(paramKeys);

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
