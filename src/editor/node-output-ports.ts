import { normalizeWaitMode } from '../approvals/wait.types';
import type { PortDefinition } from '../common/types/validation';
import type { WorkflowNode } from '../common/types/graph';

interface ConditionRow {
  id?: string;
  label?: string;
  type?: string;
}

const PORT_LABELS: Record<string, string> = {
  true: 'True',
  false: 'False',
  none: 'Otherwise',
  else: 'Else',
  loop: 'Loop body',
  end: 'Exit',
  continue: 'Continue',
  rejected: 'Rejected',
  timed_out: 'Timed out',
  out: 'Output',
};

export function portLabel(portId: string): string {
  return PORT_LABELS[portId] ?? portId;
}

/** Resolve effective output port ids for a node (config-aware for If/Else and Wait). */
export function resolveNodeOutputPortIds(
  nodeType: string,
  config: Record<string, unknown> | undefined,
  catalogOutputs?: PortDefinition[],
): string[] {
  const cfg = config ?? {};

  if (nodeType === 'builtins.IfElse') {
    const mode = String(cfg.conditionMode ?? 'simple');
    if (mode === 'multi' && Array.isArray(cfg.conditions)) {
      const rows = cfg.conditions as ConditionRow[];
      const ports: string[] = [];
      for (const row of rows) {
        if (row.type === 'else') {
          ports.push(row.id ?? 'else');
        } else {
          ports.push(row.id ?? `branch_${ports.length}`);
        }
      }
      const hasElse = rows.some((r) => r.type === 'else');
      if (!hasElse) ports.push('none');
      return [...new Set(ports)];
    }
    return ['true', 'false'];
  }

  if (nodeType === 'builtins.Wait') {
    const mode = normalizeWaitMode(String(cfg.mode ?? 'delay'));
    switch (mode) {
      case 'delay':
      case 'until_datetime':
        return ['continue'];
      case 'until_event':
        return ['continue', 'timed_out'];
      case 'until_approval':
        return ['continue', 'rejected', 'timed_out'];
      default:
        return ['continue'];
    }
  }

  if (catalogOutputs?.length) {
    return catalogOutputs.map((p) => p.id);
  }
  return ['out'];
}

export function resolveNodeOutputPorts(
  nodeType: string,
  config: Record<string, unknown> | undefined,
  catalogOutputs?: PortDefinition[],
): PortDefinition[] {
  return resolveNodeOutputPortIds(nodeType, config, catalogOutputs).map((id) => ({
    id,
    label: portLabel(id),
  }));
}

/** Ports that can fire at runtime for a Wait node (same as output ports). */
export function waitFirablePorts(mode: string): string[] {
  return resolveNodeOutputPortIds('builtins.Wait', { mode });
}

export function getNodeOutputPorts(node: WorkflowNode, catalogOutputs?: PortDefinition[]): string[] {
  return resolveNodeOutputPortIds(node.type, node.config, catalogOutputs);
}
