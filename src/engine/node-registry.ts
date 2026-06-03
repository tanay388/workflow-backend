import { Injectable, OnModuleInit } from '@nestjs/common';
import { executeEcho } from './executors/echo.executor';
import { executeIfElse } from './executors/if-else.executor';
import { ActionExecutor } from './executors/action.executor';
import { AgentExecutor } from './executors/agent.executor';
import { UserApprovalExecutor } from './executors/user-approval.executor';
import { WaitExecutor } from './executors/wait.executor';
import { executeStart } from './executors/start.executor';
import { executeSetVariable } from './executors/set-variable.executor';
import { executeWhile } from './executors/while.executor';
import type { NodeExecutor } from './engine.types';

@Injectable()
export class NodeRegistry implements OnModuleInit {
  private readonly executors = new Map<string, NodeExecutor>();

  constructor(
    private readonly agentExecutor: AgentExecutor,
    private readonly actionExecutor: ActionExecutor,
    private readonly waitExecutor: WaitExecutor,
    private readonly userApprovalExecutor: UserApprovalExecutor,
  ) {}

  onModuleInit(): void {
    this.register('builtins.Start', executeStart);
    this.register('builtins.IfElse', executeIfElse);
    this.register('builtins.While', executeWhile);
    this.register('builtins.SetVariable', executeSetVariable);
    this.register('builtins.Echo', executeEcho);
    this.register('builtins.Agent', this.agentExecutor.execute);
    this.register('builtins.Action', this.actionExecutor.execute);
    this.register('builtins.Wait', this.waitExecutor.execute);
    this.register('builtins.UserApproval', this.userApprovalExecutor.execute);
    this.register('builtins.HumanApproval', this.userApprovalExecutor.execute);
  }

  register(type: string, executor: NodeExecutor): void {
    this.executors.set(type, executor);
  }

  get(type: string): NodeExecutor | undefined {
    return this.executors.get(type);
  }
}
