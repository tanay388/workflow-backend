import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { EmailService } from '../src/common/email/email.service';
import { AppModule } from '../src/app.module';

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDb('Workflows (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken = '';
  let workspaceId = '';
  let workflowId = '';

  beforeAll(async () => {
    const email = `wf-${Date.now()}@example.com`;
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
      .send({ email, name: 'WF User', password });
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
      .send({ name: `WF Org ${Date.now()}` });
    workspaceId = org.body.workspace.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  const withAuth = (req: ReturnType<typeof request>) =>
    req
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Workspace-Id', workspaceId);

  it('creates workflow with initial version', async () => {
    const res = await withAuth(request(app.getHttpServer()).post('/workflows'))
      .send({ name: 'Test Workflow' })
      .expect(201);

    workflowId = res.body.id;
    expect(res.body.version).toBe(1);
    expect(res.body.graph.nodes).toHaveLength(1);
    expect(res.body.graph.nodes[0].type).toBe('builtins.Start');
  }, 30_000);

  it('lists workflows for workspace', async () => {
    const res = await withAuth(request(app.getHttpServer()).get('/workflows')).expect(200);
    expect(res.body.some((w: { id: string }) => w.id === workflowId)).toBe(true);
  });

  it('PUT graph creates version 2', async () => {
    const detail = await withAuth(
      request(app.getHttpServer()).get(`/workflows/${workflowId}`),
    ).expect(200);
    const graph = { ...detail.body.graph };
    graph.nodes.push({
      id: 'n_agent',
      type: 'builtins.Agent',
      label: 'Agent',
      config: { instructions: 'Done', provider: 'openai', model: 'gpt-4o' },
      position: { x: 400, y: 200 },
    });
    graph.edges.push({
      id: 'e1',
      source_node_id: 'n_start',
      source_port_id: 'out',
      target_node_id: 'n_agent',
      target_port_id: 'in',
    });

    const updated = await withAuth(
      request(app.getHttpServer()).put(`/workflows/${workflowId}`),
    )
      .send({ graph, note: 'Added agent node' })
      .expect(200);

    expect(updated.body.version).toBe(2);
  }, 30_000);

  it('lists versions newest first', async () => {
    const res = await withAuth(
      request(app.getHttpServer()).get(`/workflows/${workflowId}/versions`),
    ).expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].version).toBe(2);
  });

  it('restore v1 creates version 3 non-destructively', async () => {
    const v1Before = await withAuth(
      request(app.getHttpServer()).get(`/workflows/${workflowId}/versions/1`),
    ).expect(200);
    const v1Graph = JSON.parse(JSON.stringify(v1Before.body.graph));

    await withAuth(
      request(app.getHttpServer()).post(`/workflows/${workflowId}/versions/1/restore`),
    ).expect(201);

    const versions = await withAuth(
      request(app.getHttpServer()).get(`/workflows/${workflowId}/versions`),
    ).expect(200);
    expect(versions.body).toHaveLength(3);

    const v1After = await withAuth(
      request(app.getHttpServer()).get(`/workflows/${workflowId}/versions/1`),
    ).expect(200);
    expect(v1After.body.graph).toEqual(v1Graph);

    const current = await withAuth(
      request(app.getHttpServer()).get(`/workflows/${workflowId}`),
    ).expect(200);
    expect(current.body.version).toBe(3);
    expect(current.body.graph).toEqual(v1Graph);
  }, 30_000);

  it('validate rejects invalid graph', async () => {
    const res = await withAuth(
      request(app.getHttpServer()).post(`/workflows/${workflowId}/validate`),
    )
      .send({
        graph: {
          input_schema: { type: 'object', properties: {} },
          nodes: [],
          edges: [],
        },
      })
      .expect(201);
    expect(res.body.valid).toBe(false);
  });

  it('rejects cross-tenant access', async () => {
    await request(app.getHttpServer())
      .get(`/workflows/${workflowId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Workspace-Id', '00000000-0000-4000-8000-000000000099')
      .expect(403);
  });
});
