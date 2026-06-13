import { ChatTurnService } from './chat-turn.service';
import { ConversationHistoryService } from './conversation-history.service';
import { ConversationService } from './conversation.service';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';

describe('ChatTurnService', () => {
  const tenancy = { orgId: 'org-1', workspaceId: 'ws-1', userId: 'u-1' };

  const conversations = {
    findBuilderTestScoped: jest.fn(async () => ({
      id: 'conv-1',
      workflowId: 'wf-1',
      status: 'open',
      title: null,
      source: 'builder_test',
    })),
  };

  const history = {
    buildAgentHistory: jest.fn(async () => []),
  };

  const queue = { enqueue: jest.fn(async () => ({ runId: 'run-1' })) };
  const workflows = {
    findOne: jest.fn(async () => ({ id: 'wf-1', currentVersionId: 'ver-1' })),
  };
  const versions = {
    findOne: jest.fn(async () => ({ graph: { nodes: [], edges: [], input_schema: { type: 'object', properties: {} } } })),
  };
  const dataSource = {
    transaction: jest.fn(async (fn: (em: unknown) => Promise<void>) => {
      const msgRepo = {
        createQueryBuilder: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          setLock: jest.fn().mockReturnThis(),
          getRawOne: jest.fn(async () => ({ max: '0' })),
        })),
        create: jest.fn((x) => ({ ...x, id: x.role === 'user' ? 'user-msg' : 'asst-msg' })),
        save: jest.fn(async (x) => x),
      };
      const convRepo = { update: jest.fn() };
      await fn({ getRepository: (entity: unknown) => (entity === Object ? msgRepo : convRepo) });
      return fn({
        getRepository: (cls: { name?: string }) => {
          if (cls.name === 'ConversationMessage') return msgRepo;
          return convRepo;
        },
      });
    }),
  };
  const messages = { update: jest.fn() };
  const byok = { validateGraph: jest.fn(async () => []) };
  const svc = new ChatTurnService(
    conversations as unknown as ConversationService,
    history as unknown as ConversationHistoryService,
    queue as never,
    workflows as never,
    versions as never,
    dataSource as never,
    messages as never,
    byok as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('enqueues chat run with conversation and message ids', async () => {
    dataSource.transaction.mockImplementation(async (fn) => {
      const msgRepo = {
        createQueryBuilder: () => ({
          select: () => ({
            where: () => ({
              getRawOne: async () => ({ max: '0' }),
            }),
          }),
        }),
        create: (x: { role: string }) => ({
          ...x,
          id: x.role === 'user' ? 'user-msg' : 'asst-msg',
        }),
        save: async (x: { id: string }) => x,
      };
      const convRepo = {
        createQueryBuilder: () => ({
          setLock: () => ({
            where: () => ({
              getOne: async () => ({ id: 'conv-1' }),
            }),
          }),
        }),
        update: jest.fn(),
      };
      await fn({
        getRepository: (cls: unknown) => {
          if (cls === Conversation) return convRepo;
          if (cls === ConversationMessage) return msgRepo;
          return msgRepo;
        },
      });
    });

    const result = await svc.sendTurn(tenancy, 'conv-1', 'u-1', 'Hello');

    expect(result).toEqual({ runId: 'run-1', messageId: 'asst-msg' });
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerSource: 'chat',
        conversationId: 'conv-1',
        messageId: 'asst-msg',
        orgId: 'org-1',
        workspaceId: 'ws-1',
      }),
    );
  });
});
