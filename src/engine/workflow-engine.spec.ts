import { Test } from '@nestjs/testing';
import type { WorkflowGraph } from '../common/types/graph';
import { AppConfigService } from '../common/config/config.service';
import { ExpressionService } from '../variables/expression.service';
import { ContextResolver } from './context-resolver';
import { ActionExecutor } from './executors/action.executor';
import { AgentExecutor } from './executors/agent.executor';
import { UserApprovalExecutor } from './executors/user-approval.executor';
import { WaitExecutor } from './executors/wait.executor';
import { NodeRegistry } from './node-registry';
import { WorkflowEngine } from './workflow-engine';

const stubExecutor = { execute: jest.fn() };

const defaultConfig = {
  engineAgentTimeoutSeconds: 120,
  engineAgentTimeoutMaxSeconds: 600,
} as Pick<AppConfigService, 'engineAgentTimeoutSeconds' | 'engineAgentTimeoutMaxSeconds'>;

function buildGraph(overrides?: Partial<WorkflowGraph>): WorkflowGraph {
  return {
    input_schema: { type: 'object', properties: {} },
    nodes: [
      {
        id: 'n_start',
        type: 'builtins.Start',
        label: 'Start',
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: 'n_if',
        type: 'builtins.IfElse',
        label: 'If',
        config: { condition: '{{ input.score }} > 5' },
        position: { x: 200, y: 0 },
      },
    ],
    edges: [
      {
        id: 'e1',
        source_node_id: 'n_start',
        source_port_id: 'out',
        target_node_id: 'n_if',
        target_port_id: 'in',
      },
    ],
    ...overrides,
  };
}

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(async () => {
    stubExecutor.execute.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        WorkflowEngine,
        NodeRegistry,
        ContextResolver,
        ExpressionService,
        { provide: AppConfigService, useValue: defaultConfig },
        { provide: AgentExecutor, useValue: stubExecutor },
        { provide: ActionExecutor, useValue: stubExecutor },
        { provide: WaitExecutor, useValue: stubExecutor },
        { provide: UserApprovalExecutor, useValue: stubExecutor },
      ],
    }).compile();
    await module.init();
    engine = module.get(WorkflowEngine);
  });

  it('completes Start → IfElse with no outgoing edge (terminal)', async () => {
    const result = await engine.run({
      graph: buildGraph(),
      runId: 'run-1',
      orgId: 'org',
      workspaceId: 'ws',
      workflowId: 'wf-1',
      workflowVersionId: 'v1',
      input: { score: 9 },
      maxSteps: 100,
    });
    expect(result.status).toBe('completed');
  });

  it('follows true branch port', async () => {
    const graph = buildGraph({
      nodes: [
        ...buildGraph().nodes,
        {
          id: 'n_echo',
          type: 'builtins.Echo',
          label: 'Echo',
          config: { msg: 'yes' },
          position: { x: 400, y: 0 },
        },
      ],
      edges: [
        ...buildGraph().edges,
        {
          id: 'e2',
          source_node_id: 'n_if',
          source_port_id: 'true',
          target_node_id: 'n_echo',
          target_port_id: 'in',
        },
      ],
    });

    const steps: string[] = [];
    const result = await engine.run({
      graph,
      runId: 'run-2',
      orgId: 'org',
      workspaceId: 'ws',
      workflowId: 'wf-1',
      workflowVersionId: 'v1',
      input: { score: 9 },
      maxSteps: 100,
      onStepEnd: async (p) => {
        steps.push(p.nodeId);
      },
    });

    expect(result.status).toBe('completed');
    expect(steps).toEqual(['n_start', 'n_if', 'n_echo']);
  });

  it('IfElse step output is JSON-serializable after upstream nodes (no circular passthrough)', async () => {
    const graph: WorkflowGraph = {
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string', default: 'Hello' } },
      },
      parameters: [{ key: 'query', type: 'string', default: 'Hello' }],
      nodes: [
        {
          id: 'n_start',
          type: 'builtins.Start',
          label: 'Start',
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: 'n_agent',
          type: 'builtins.Echo',
          label: 'AI Agent',
          config: { msg: 'done' },
          position: { x: 100, y: 0 },
        },
        {
          id: 'n_if',
          type: 'builtins.IfElse',
          label: 'If / Else',
          config: { condition: '{{ vars.query }} == "Hello"' },
          position: { x: 200, y: 0 },
        },
      ],
      edges: [
        {
          id: 'e1',
          source_node_id: 'n_start',
          source_port_id: 'out',
          target_node_id: 'n_agent',
          target_port_id: 'in',
        },
        {
          id: 'e2',
          source_node_id: 'n_agent',
          source_port_id: 'out',
          target_node_id: 'n_if',
          target_port_id: 'in',
        },
      ],
    };

    let ifElseOutput: unknown;
    const result = await engine.run({
      graph,
      runId: 'run-circular',
      orgId: 'org',
      workspaceId: 'ws',
      workflowId: 'wf-1',
      workflowVersionId: 'v1',
      input: { query: 'Hello' },
      maxSteps: 100,
      onStepEnd: async (p) => {
        if (p.nodeId === 'n_if') ifElseOutput = p.output;
      },
    });

    expect(result.status).toBe('completed');
    expect(ifElseOutput).toBeDefined();
    expect(() => JSON.stringify(ifElseOutput)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(ifElseOutput)) as Record<string, unknown>;
    expect(parsed.branch).toBe('true');
    expect(parsed.passthrough).toEqual(
      expect.objectContaining({
        'AI Agent': expect.anything(),
      }),
    );
  });

  it('fails when max steps exceeded in While loop', async () => {
    const graph: WorkflowGraph = {
      input_schema: { type: 'object', properties: {} },
      max_steps: 5,
      nodes: [
        {
          id: 'n_start',
          type: 'builtins.Start',
          label: 'Start',
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: 'n_while',
          type: 'builtins.While',
          label: 'While',
          config: { condition: 'true', max_iterations: 100 },
          position: { x: 200, y: 0 },
        },
      ],
      edges: [
        {
          id: 'e1',
          source_node_id: 'n_start',
          source_port_id: 'out',
          target_node_id: 'n_while',
          target_port_id: 'in',
        },
        {
          id: 'e2',
          source_node_id: 'n_while',
          source_port_id: 'loop',
          target_node_id: 'n_while',
          target_port_id: 'in',
        },
      ],
    };

    await expect(
      engine.run({
        graph,
        runId: 'run-3',
        orgId: 'org',
        workspaceId: 'ws',
        workflowId: 'wf-1',
      workflowVersionId: 'v1',
        input: {},
        maxSteps: 5,
      }),
    ).rejects.toThrow(/max steps exceeded/);
  });

  it('fails agent node when execution exceeds timeout', async () => {
    jest.useFakeTimers();
    stubExecutor.execute.mockImplementation(() => new Promise(() => {}));

    const module = await Test.createTestingModule({
      providers: [
        WorkflowEngine,
        NodeRegistry,
        ContextResolver,
        ExpressionService,
        {
          provide: AppConfigService,
          useValue: {
            engineAgentTimeoutSeconds: 1,
            engineAgentTimeoutMaxSeconds: 600,
          },
        },
        { provide: AgentExecutor, useValue: stubExecutor },
        { provide: ActionExecutor, useValue: stubExecutor },
        { provide: WaitExecutor, useValue: stubExecutor },
        { provide: UserApprovalExecutor, useValue: stubExecutor },
      ],
    }).compile();
    await module.init();
    const timeoutEngine = module.get(WorkflowEngine);

    const graph: WorkflowGraph = {
      input_schema: { type: 'object', properties: {} },
      nodes: [
        {
          id: 'n_start',
          type: 'builtins.Start',
          label: 'Start',
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: 'n_agent',
          type: 'builtins.Agent',
          label: 'Slow Agent',
          config: { instructions: 'test', prompt: 'hi' },
          position: { x: 200, y: 0 },
        },
      ],
      edges: [
        {
          id: 'e1',
          source_node_id: 'n_start',
          source_port_id: 'out',
          target_node_id: 'n_agent',
          target_port_id: 'in',
        },
      ],
    };

    const runPromise = timeoutEngine.run({
      graph,
      runId: 'run-timeout',
      orgId: 'org',
      workspaceId: 'ws',
      workflowId: 'wf-1',
      workflowVersionId: 'v1',
      input: {},
      maxSteps: 10,
    });
    const settled = runPromise.then(
      () => {
        throw new Error('expected run to fail with timeout');
      },
      (err: unknown) => err,
    );

    await jest.advanceTimersByTimeAsync(1000);
    const err = await settled;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/Slow Agent.*timed out/i);
    jest.useRealTimers();
  });
});
