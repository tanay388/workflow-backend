import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { EmailService } from '../src/common/email/email.service';
import { AppModule } from '../src/app.module';

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDb('IAM (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken = '';
  let orgId = '';
  let workspaceId = '';

  beforeAll(async () => {
    const email = `iam-${Date.now()}@example.com`;
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
      .send({ email, name: 'IAM User', password });
    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ email, code: otp });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    accessToken = login.body.accessToken;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('creates org with owner membership and default workspace', async () => {
    const res = await request(app.getHttpServer())
      .post('/orgs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Org ${Date.now()}` })
      .expect(201);

    orgId = res.body.org.id;
    workspaceId = res.body.workspace.id;
    expect(res.body.membership.role).toBe('owner');
  }, 30_000);

  it('lists workspaces for org and rejects non-member org access', async () => {
    const ws = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/workspaces`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(ws.body.length).toBeGreaterThan(0);

    const fakeOrg = '00000000-0000-4000-8000-000000000099';
    await request(app.getHttpServer())
      .get(`/orgs/${fakeOrg}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('returns audit logs for org actions', async () => {
    const logs = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/audit-logs`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(logs.body.data.some((l: { action: string }) => l.action === 'org.created')).toBe(true);
  });
});
