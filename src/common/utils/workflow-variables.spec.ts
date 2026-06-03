import { buildDefaultRunInput, buildInitialVars, mergeRunInput } from './workflow-variables';
import type { WorkflowGraph } from '../types/graph';

const graph: WorkflowGraph = {
  input_schema: {
    type: 'object',
    properties: {
      topic: { type: 'string', default: 'news' },
    },
  },
  workflow_vars: {
    counter: { type: 'number', default: 1 },
  },
  nodes: [],
  edges: [],
};

describe('workflow-variables', () => {
  it('builds initial vars from workflow_vars', () => {
    expect(buildInitialVars(graph)).toEqual({ counter: 1 });
  });

  it('merges run input with defaults', () => {
    expect(mergeRunInput(graph, { topic: 'sports' })).toEqual({ topic: 'sports' });
    expect(mergeRunInput(graph, {})).toEqual({ topic: 'news' });
  });

  it('builds default run input', () => {
    expect(buildDefaultRunInput(graph)).toEqual({ topic: 'news' });
  });
});
