import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { EmailService } from '../src/common/email/email.service';
import { AppModule } from '../src/app.module';

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDb('Variables (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken = '';
  let workspaceId = '';
  let workflowId = '';

  beforeAll(async () => {
    const email = `vars-${Date.now()}@example.com`;
    const password = 'TestPass123!';

    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({
        sendTemplate: jest.fn(async () => ({ delivered: false, html: '' })),
        render: jest.fn(),
        onModuleInit: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    let otp = '000000';
    const emailSvc = moduleFixture.get(EmailService);
    (emailSvc.sendTemplate as jest.Mock).mockImplementation(
      async (opts: { context?: { code?: string } }) => {
        otp = String(opts.context?.code ?? '000000');
        return { delivered: false, html: '' };
      },
    );

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email, name: 'Vars User', password });
    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ email, code: otp });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    accessToken = login.body.accessToken;

    const org = await request(app.getHttpServer())
      .post('/orgs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Vars Org ${Date.now()}` });
    workspaceId = org.body.workspace.id;

    const wf = await request(app.getHttpServer())
      .post('/workflows')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'Vars WF' });
    workflowId = wf.body.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  const withAuth = (req: ReturnType<typeof request>) =>
    req.set('Authorization', `Bearer ${accessToken}`).set('X-Workspace-Id', workspaceId);

  it('GET /node-types returns catalog', async () => {
    const res = await withAuth(request(app.getHttpServer()).get('/node-types')).expect(200);
    expect(res.body.some((t: { key: string }) => t.key === 'builtins.Agent')).toBe(true);
    expect(res.body[0].configSchema).toBeDefined();
  });

  it('returns upstream variables for connected node', async () => {
    const detail = await withAuth(
      request(app.getHttpServer()).get(`/workflows/${workflowId}`),
    ).expect(200);

    const graph = { ...detail.body.graph };
    graph.input_schema = { type: 'object', properties: { query: { type: 'string' } } };
    graph.nodes.push({
      id: 'n_agent',
      type: 'builtins.Agent',
      label: 'Summarizer',
      config: { instructions: 'Hi', provider: 'openai', model: 'gpt-4o' },
      position: { x: 300, y: 200 },
    });
    graph.edges.push({
      id: 'e1',
      source_node_id: 'n_start',
      source_port_id: 'out',
      target_node_id: 'n_agent',
      target_port_id: 'in',
    });

    await withAuth(request(app.getHttpServer()).put(`/workflows/${workflowId}`))
      .send({ graph, note: 'agent' })
      .expect(200);

    const vars = await withAuth(
      request(app.getHttpServer()).get(
        `/workflows/${workflowId}/nodes/n_agent/variables`,
      ),
    ).expect(200);

    expect(vars.body.upstream.some((u: { nodeId: string }) => u.nodeId === 'n_start')).toBe(
      true,
    );
    const startFields = vars.body.upstream.find((u: { nodeId: string }) => u.nodeId === 'n_start')?.fields ?? [];
    expect(startFields.some((f: { path: string }) => f.path.includes('query'))).toBe(true);
  }, 30_000);

  it('blocks save with forward reference', async () => {
    const detail = await withAuth(
      request(app.getHttpServer()).get(`/workflows/${workflowId}`),
    ).expect(200);

    const graph = { ...detail.body.graph };
    graph.nodes.push({
      id: 'n_a',
      type: 'builtins.Agent',
      label: 'A',
      config: {
        instructions: '{{ node.B.output.text }}',
        provider: 'openai',
        model: 'gpt-4o',
      },
      position: { x: 200, y: 0 },
    });
    graph.nodes.push({
      id: 'n_b',
      type: 'builtins.Agent',
      label: 'B',
      config: { instructions: 'ok', provider: 'openai', model: 'gpt-4o' },
      position: { x: 400, y: 0 },
    });
    graph.edges.push({
      id: 'e_a',
      source_node_id: 'n_start',
      source_port_id: 'out',
      target_node_id: 'n_a',
      target_port_id: 'in',
    });

    await withAuth(request(app.getHttpServer()).put(`/workflows/${workflowId}`))
      .send({ graph })
      .expect(400);
  }, 30_000);
});
