import { Injectable } from '@nestjs/common';
import type { WorkflowNode } from '../../common/types/graph';
import type { NodeExecutor } from '../engine.types';
import { WaitExecutor } from './wait.executor';

/** Human approval delegates to Wait `until_approval` (TRD §6.7). */
@Injectable()
export class UserApprovalExecutor {
  constructor(private readonly waitExecutor: WaitExecutor) {}

  execute: NodeExecutor = async (ctx, node) => {
    const merged: WorkflowNode = {
      ...node,
      config: {
        ...node.config,
        mode: 'until_approval',
        approval: {
          title: (node.config?.message as string) ?? 'Please approve to continue',
          timeout_minutes: (node.config?.timeout_minutes as number) ?? 1440,
          approvers: node.config?.approvers,
        },
      },
    };
    const result = await this.waitExecutor.execute(ctx, merged);
    return this.mapPorts(result);
  };

  private mapPorts(result: { port: string; data: unknown }) {
    if (result.port === 'continue') {
      return { port: 'approved', data: { ...((result.data as object) ?? {}), decision: 'approved' } };
    }
    if (result.port === 'timed_out') {
      return {
        port: 'rejected',
        data: { ...((result.data as object) ?? {}), decision: 'rejected', timed_out: true },
      };
    }
    return { port: 'rejected', data: { ...((result.data as object) ?? {}), decision: 'rejected' } };
  }
}
