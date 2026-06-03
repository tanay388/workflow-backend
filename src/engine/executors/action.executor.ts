import { Injectable } from '@nestjs/common';
import type { WorkflowNode } from '../../common/types/graph';
import { ToolResolverService } from '../../connections/tool-resolver.service';
import type { Tenancy } from '../../common/tenancy/tenancy-context.service';
import type { NodeExecutor, NodeExecutorContext } from '../engine.types';

@Injectable()
export class ActionExecutor {
  constructor(private readonly tools: ToolResolverService) {}

  execute: NodeExecutor = async (ctx, node: WorkflowNode) => {
    const config = ctx.resolveConfig(node.config ?? {});
    const connectionId = String(config.connection_id ?? config.connected_account_id ?? '');
    const action = String(config.action ?? '');
    const params = (config.params as Record<string, unknown>) ?? {};

    if (!connectionId || !action) {
      return {
        port: 'error',
        data: { error: 'Action node requires connection_id and action' },
      };
    }

    const tenancy: Tenancy = {
      orgId: ctx.orgId,
      workspaceId: ctx.workspaceId,
    };

    const result = await this.tools.invoke(tenancy, connectionId, action, params);
    if (result.ok) {
      return { port: 'success', data: { result: result.data } };
    }
    return { port: 'error', data: { error: result.error, reconnect: true } };
  };
}
