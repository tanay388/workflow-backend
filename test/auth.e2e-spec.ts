import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { EmailService } from '../src/common/email/email.service';
import { AppModule } from '../src/app.module';

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDb('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let capturedOtp = '000000';
  const email = `phase2-${Date.now()}@example.com`;
  const password = 'TestPass123!';

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({
        sendTemplate: jest.fn(async (opts: { context?: { code?: string } }) => {
          capturedOtp = String(opts.context?.code ?? '000000');
          return { delivered: false, html: '' };
        }),
        render: jest.fn(),
        onModuleInit: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it(
    'signup → verify-otp → login → refresh → logout',
    async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email, name: 'Phase Two', password })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ email, code: capturedOtp })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const { accessToken, refreshToken } = login.body;
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.user.email).toBe(email);
      });

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(201);

    const nextRefresh = refreshed.body.refreshToken as string;
    expect(nextRefresh).not.toBe(refreshToken);

    // Replaying the just-rotated token within the grace window returns the
    // same successor (reload / parallel-tab tolerance) instead of failing.
    const replay = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(201);
    expect(replay.body.refreshToken).toBe(nextRefresh);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: nextRefresh })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: nextRefresh })
      .expect(401);

    // Logout closes the whole chain: grace replay of the predecessor must
    // fail once its successor is revoked.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  },
    30_000,
  );

  it(
    'blocks login before email verification',
    async () => {
    const pendingEmail = `pending-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: pendingEmail, name: 'Pending', password })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: pendingEmail, password })
      .expect(401);
  },
    15_000,
  );
});
