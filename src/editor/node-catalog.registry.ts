import type { JsonSchema, JsonSchemaProperty } from '../common/types/json-schema';
import type { NodeTypeDescriptor } from '../common/types/validation';

function str(title: string, extra?: Partial<JsonSchemaProperty>): JsonSchemaProperty {
  return { type: 'string', title, ...extra };
}

function node(partial: Omit<NodeTypeDescriptor, 'key'> & { key: string }): NodeTypeDescriptor {
  return partial;
}

export const BUILTIN_NODE_TYPES: NodeTypeDescriptor[] = [
  node({
    key: 'builtins.Start',
    label: 'Start',
    category: 'triggers',
    description: 'Manual, API, or chat run entry',
    inputs: [],
    outputs: [{ id: 'out', label: 'Output' }],
    configSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      title: 'Workflow input',
      description: 'Mirrors graph.input_schema at runtime',
      properties: {},
    },
  }),
  node({
    key: 'builtins.Trigger.WorkflowChain',
    label: 'Workflow Chain',
    category: 'triggers',
    description: 'Trigger when another workflow finishes',
    configOnly: true,
    inputs: [],
    outputs: [],
    configSchema: {
      type: 'object',
      required: ['source_workflow_id', 'event'],
      properties: {
        source_workflow_id: str('Source workflow'),
        event: { type: 'string', title: 'Event', enum: ['completed', 'failed'] },
      },
    },
    outputSchema: { type: 'object', properties: {} },
  }),
  node({
    key: 'builtins.IfElse',
    label: 'If / Else',
    category: 'logic',
    description: 'Conditional branching',
    inputs: [{ id: 'in', label: 'Input', required: true }],
    outputs: [
      { id: 'true', label: 'True' },
      { id: 'false', label: 'False' },
    ],
    configSchema: {
      type: 'object',
      required: ['condition'],
      properties: { condition: str('Condition expression') },
    },
    outputSchema: {
      type: 'object',
      properties: {
        branch: { type: 'string', title: 'Branch taken' },
        passthrough: { type: 'object', title: 'Upstream context' },
      },
    },
  }),
  node({
    key: 'builtins.While',
    label: 'While Loop',
    category: 'logic',
    description: 'Loop while condition holds',
    inputs: [{ id: 'in', label: 'Input', required: true }],
    outputs: [
      { id: 'loop', label: 'Loop body' },
      { id: 'end', label: 'Exit' },
    ],
    configSchema: {
      type: 'object',
      required: ['condition'],
      properties: {
        condition: str('Loop condition'),
        max_iterations: { type: 'integer', title: 'Max iterations', default: 20 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        iterations: { type: 'integer', title: 'Iterations run' },
        passthrough: { type: 'object', title: 'Upstream context' },
      },
    },
  }),
  node({
    key: 'builtins.SetVariable',
    label: 'Set Variable',
    category: 'logic',
    description: 'Update pipeline variables (vars.*)',
    inputs: [{ id: 'in', label: 'Input', required: true }],
    outputs: [{ id: 'out', label: 'Output' }],
    configSchema: {
      type: 'object',
      properties: {
        assignments: {
          type: 'array',
          title: 'Assignments',
          items: {
            type: 'object',
            properties: {
              name: str('Variable name'),
              value: str('Value (supports {{ expressions }})'),
            },
          },
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: { passthrough: { type: 'object', title: 'Upstream context' } },
    },
  }),
  node({
    key: 'builtins.Wait',
    label: 'Wait',
    category: 'logic',
    description: 'Pause execution (delay, datetime, event, or approval)',
    inputs: [{ id: 'in', label: 'Input', required: true }],
    outputs: [
      { id: 'continue', label: 'Continue' },
      { id: 'rejected', label: 'Rejected' },
      { id: 'timed_out', label: 'Timed out' },
    ],
    configSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          title: 'Mode',
          enum: ['delay', 'until_datetime', 'until_event', 'until_approval'],
          default: 'delay',
        },
        delay: {
          type: 'object',
          title: 'Delay',
          properties: {
            value: { type: 'integer', title: 'Value', default: 1 },
            unit: {
              type: 'string',
              title: 'Unit',
              enum: ['seconds', 'minutes', 'hours', 'days'],
              default: 'minutes',
            },
          },
        },
        until: {
          type: 'object',
          title: 'Until datetime',
          properties: {
            datetime: { type: 'string', title: 'Local datetime (ISO)', default: '' },
            timezone: { type: 'string', title: 'IANA timezone', default: 'UTC' },
          },
        },
        event: {
          type: 'object',
          title: 'Until event',
          properties: {
            toolkit: str('Toolkit'),
            event_slug: str('Event slug'),
            connection_id: str('Connection'),
            trigger_config: {
              type: 'object',
              title: 'Trigger configuration',
              description: 'Sent to Composio when the trigger instance is registered',
              properties: {},
            },
            match: { type: 'object', title: 'Match filter', properties: {} },
            timeout_minutes: { type: 'integer', title: 'Timeout (minutes)', default: 60 },
          },
        },
        approval: {
          type: 'object',
          title: 'Until approval',
          properties: {
            title: str('Title', { default: 'Approval required' }),
            approvers: { type: 'array', title: 'Approvers', items: { type: 'string' } },
            timeout_minutes: { type: 'integer', title: 'Timeout (minutes)', default: 1440 },
          },
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        outcome: { type: 'string', title: 'Outcome' },
        resumed_at: { type: 'string', title: 'Resumed at' },
        event: { type: 'object', title: 'Event payload (until_event resume)' },
      },
    },
  }),
  node({
    key: 'builtins.Agent',
    label: 'AI Agent',
    category: 'ai',
    description: 'LLM agent with tools and knowledge',
    inputs: [{ id: 'in', label: 'Input', required: true }],
    outputs: [{ id: 'out', label: 'Output' }],
    configSchema: {
      type: 'object',
      required: ['instructions'],
      properties: {
        provider: {
          type: 'string',
          title: 'Provider',
          enum: ['openai', 'anthropic', 'deepseek', 'groq', 'together'],
          default: 'openai',
        },
        model: { type: 'string', title: 'Model', default: 'gpt-4o' },
        temperature: { type: 'number', title: 'Temperature', default: 0.7 },
        timeout_seconds: {
          type: 'integer',
          title: 'Timeout (seconds)',
          description:
            'Max wall-clock time for this agent step. Omit to use the platform default (120s).',
          minimum: 1,
          maximum: 600,
        },
        instructions: str('System instructions'),
        prompt: str('User prompt', {
          description: 'Query sent to the agent; supports {{ input.* }} and {{ vars.* }}',
        }),
        toolkits: { type: 'array', title: 'Toolkits', items: { type: 'string' } },
        toolkit_bindings: {
          type: 'object',
          title: 'Toolkit bindings',
          description: 'Per-toolkit connection and allowed Composio actions',
          properties: {},
        },
        connection_id: str('Legacy default connection'),
        connected_account_id: str('Legacy default connection'),
        knowledge_base_id: str('Knowledge base'),
        structured_output: {
          type: 'object',
          title: 'Structured output schema',
          properties: {},
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', title: 'Response text' },
        structured: { type: 'object', title: 'Structured output' },
        tool_calls: { type: 'array', title: 'Tool calls', items: { type: 'object', properties: {} } },
      },
    },
  }),
  node({
    key: 'builtins.Action',
    label: 'Tool Action',
    category: 'ai',
    description: 'Run a single Composio action against a linked service',
    inputs: [{ id: 'in', label: 'Input', required: true }],
    outputs: [
      { id: 'success', label: 'Success' },
      { id: 'error', label: 'Error' },
    ],
    configSchema: {
      type: 'object',
      required: ['toolkit', 'action', 'connection_id'],
      properties: {
        toolkit: str('Toolkit'),
        action: str('Action slug'),
        connection_id: str('Connection'),
        params: { type: 'object', title: 'Action parameters', properties: {} },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'object', title: 'Action result' },
        error: { type: 'string', title: 'Error message' },
      },
    },
  }),
  node({
    key: 'builtins.UserApproval',
    label: 'Human Approval',
    category: 'human',
    description: 'Wait for human approval',
    inputs: [{ id: 'in', label: 'Input', required: true }],
    outputs: [
      { id: 'approved', label: 'Approved' },
      { id: 'rejected', label: 'Rejected' },
    ],
    configSchema: {
      type: 'object',
      properties: { message: str('Approval message', { default: 'Please approve to continue' }) },
    },
    outputSchema: {
      type: 'object',
      properties: {
        decision: { type: 'string', title: 'Decision', enum: ['approved', 'rejected'] },
        comment: { type: 'string', title: 'Comment' },
      },
    },
  }),
];

export function getBuiltinNodeType(key: string): NodeTypeDescriptor | undefined {
  return BUILTIN_NODE_TYPES.find((n) => n.key === key);
}
