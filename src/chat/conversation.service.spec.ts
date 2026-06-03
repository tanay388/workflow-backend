import { NotFoundException } from '@nestjs/common';
import { ConversationService, titleFromFirstMessage } from './conversation.service';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { Workflow } from '../workflows/entities/workflow.entity';

describe('ConversationService', () => {
  const tenancy = { orgId: 'org-1', workspaceId: 'ws-1', userId: 'u-1' };

  const conversations = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ ...x, id: 'conv-1', createdAt: new Date() })),
    update: jest.fn(),
  };
  const messages = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ ...x, id: `msg-${x.seq}`, createdAt: new Date() })),
    createQueryBuilder: jest.fn(),
  };
  const workflows = {
    findOne: jest.fn(async () => ({ id: 'wf-1', currentVersionId: 'v-1' })),
  };

  const svc = new ConversationService(
    conversations as never,
    messages as never,
    workflows as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('scopes findScoped to tenant', async () => {
    conversations.findOne.mockResolvedValue(null);
    await expect(svc.findScoped(tenancy, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(conversations.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: 'org-1', workspaceId: 'ws-1' }),
      }),
    );
  });

  it('titleFromFirstMessage uses first line', () => {
    expect(titleFromFirstMessage('Hello\nworld')).toBe('Hello');
    expect(titleFromFirstMessage('  spaced   words  ')).toBe('spaced words');
  });

  it('orders transcript by seq', async () => {
    conversations.findOne.mockResolvedValue({
      id: 'conv-1',
      workflowId: 'wf-1',
      title: null,
      status: 'open',
      source: 'builder_test',
      lastMessageAt: null,
    } as Conversation);
    messages.find.mockResolvedValue([
      { id: 'm1', role: 'user', content: 'hi', status: 'complete', seq: 1, runId: null, inputTokens: null, outputTokens: null, model: null, createdAt: new Date() },
      { id: 'm2', role: 'assistant', content: 'hello', status: 'complete', seq: 2, runId: 'run-1', inputTokens: 1, outputTokens: 2, model: 'gpt-4o', createdAt: new Date() },
    ] as ConversationMessage[]);

    const detail = await svc.getDetail(tenancy, 'conv-1');
    expect(detail.messages.map((m) => m.seq)).toEqual([1, 2]);
    expect(detail.messages[1]?.runId).toBe('run-1');
  });
});
