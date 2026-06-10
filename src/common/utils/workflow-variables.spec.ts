import {
  buildDefaultRunInput,
  buildInitialParamBag,
  buildInitialVars,
  deriveLegacyFields,
  getWorkflowParameters,
  mergeRunInput,
} from './workflow-variables';
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

describe('getWorkflowParameters (dual-read)', () => {
  it('derives unified parameters from legacy fields', () => {
    expect(getWorkflowParameters(graph)).toEqual([
      expect.objectContaining({ key: 'topic', type: 'string', default: 'news', mutable: false }),
      expect.objectContaining({ key: 'counter', type: 'number', default: 1, mutable: true }),
    ]);
  });

  it('prefers explicit parameters over legacy fields', () => {
    const unified: WorkflowGraph = {
      ...graph,
      parameters: [{ key: 'only', type: 'string', default: 'x' }],
    };
    expect(getWorkflowParameters(unified)).toEqual([
      { key: 'only', type: 'string', default: 'x' },
    ]);
  });

  it('filters out invalid parameter keys', () => {
    const unified: WorkflowGraph = {
      ...graph,
      parameters: [
        { key: 'good_one', type: 'string' },
        { key: '1bad', type: 'string' },
        { key: 'has space', type: 'string' },
      ],
    };
    expect(getWorkflowParameters(unified).map((p) => p.key)).toEqual(['good_one']);
  });
});

describe('deriveLegacyFields', () => {
  it('splits parameters into input_schema and workflow_vars by mutability', () => {
    const legacy = deriveLegacyFields([
      { key: 'topic', type: 'string', default: 'news', mutable: false },
      { key: 'counter', type: 'number', default: 1, mutable: true },
    ]);
    expect(legacy.input_schema).toEqual({
      type: 'object',
      properties: {
        topic: { type: 'string', title: 'topic', description: undefined, default: 'news' },
      },
    });
    expect(legacy.workflow_vars).toEqual({
      counter: { type: 'number', title: 'counter', description: undefined, default: 1 },
    });
  });
});

describe('buildInitialParamBag', () => {
  it('seeds defaults and applies run input overrides', () => {
    expect(buildInitialParamBag(graph)).toEqual({ topic: 'news', counter: 1 });
    expect(buildInitialParamBag(graph, { topic: 'sports' })).toEqual({
      topic: 'sports',
      counter: 1,
    });
  });

  it('uses type zero values when no default is declared', () => {
    const g: WorkflowGraph = {
      ...graph,
      parameters: [
        { key: 'n', type: 'number' },
        { key: 'b', type: 'boolean' },
        { key: 'o', type: 'object' },
        { key: 's', type: 'string' },
      ],
    };
    expect(buildInitialParamBag(g)).toEqual({ n: 0, b: false, o: {}, s: '' });
  });
});
