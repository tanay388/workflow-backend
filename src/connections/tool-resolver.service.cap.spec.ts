import { ToolResolverService } from './tool-resolver.service';

describe('ToolResolverService tool caps', () => {
  const tenancy = { orgId: 'org', workspaceId: 'ws', userId: null, role: null };

  it('caps implicit toolkit tools to configured max', async () => {
    const connections = {
      getById: jest.fn().mockResolvedValue({
        id: 'c1',
        status: 'connected',
        composioConnectionId: 'ca_1',
        composioEntityId: 'ws_ws',
      }),
      resolveDefault: jest.fn(),
    };
    const health = { refreshIfStale: jest.fn() };
    const composio = {
      listToolkitTools: jest.fn().mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => ({ slug: `TOOL_${i}`, name: `Tool ${i}` })),
      ),
      getAgentTools: jest.fn().mockResolvedValue([{ name: 't1' }]),
    };
    const cfg = { agentMaxToolsPerToolkit: 8 };
    const svc = new ToolResolverService(
      connections as never,
      composio as never,
      health as never,
      cfg as never,
    );

    await svc.resolveTools(tenancy as never, { github: { connection_id: 'c1', actions: [] } });

    expect(composio.getAgentTools).toHaveBeenCalledWith(
      'ws_ws',
      expect.arrayContaining(['TOOL_0', 'TOOL_7']),
      'ca_1',
    );
    const slugs = composio.getAgentTools.mock.calls[0]![1] as string[];
    expect(slugs).toHaveLength(8);
  });
});
