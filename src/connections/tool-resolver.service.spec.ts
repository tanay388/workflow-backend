import { ConnectionUnavailableError } from './connection.errors';
import { ToolResolverService } from './tool-resolver.service';

describe('ToolResolverService', () => {
  const tenancy = { orgId: 'org', workspaceId: 'ws', userId: null, role: null };

  it('throws ConnectionUnavailableError when status is not connected', async () => {
    const connections = {
      getById: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'c1',
          status: 'expired',
          composioConnectionId: 'ca_1',
          composioEntityId: 'ws_ws',
        })
        .mockResolvedValueOnce({
          id: 'c1',
          status: 'expired',
          composioConnectionId: 'ca_1',
          composioEntityId: 'ws_ws',
        }),
    };
    const health = { refreshIfStale: jest.fn() };
    const composio = { listToolkitTools: jest.fn(), getAgentTools: jest.fn() };
    const svc = new ToolResolverService(
      connections as never,
      composio as never,
      health as never,
    );

    await expect(svc.requireConnected(tenancy as never, 'c1')).rejects.toBeInstanceOf(
      ConnectionUnavailableError,
    );
  });
});
