import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';

/**
 * Boots the whole app — requires a reachable Postgres (DATABASE_URL).
 * Skipped automatically when no DATABASE_URL is set so the unit suite stays
 * green offline; run with env configured (Phase 01 DoD #1, #2, #3).
 */
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDb('App bootstrap (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health -> 200 { status: ok }', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });

  it('GET /ready -> 200 (DB reachable)', () => {
    return request(app.getHttpServer()).get('/ready').expect(200).expect({ status: 'ready' });
  });

  it('exposes exactly one initialized DataSource/pool (DoD #2)', () => {
    const byClass = app.get(DataSource);
    const byToken = app.get<DataSource>(getDataSourceToken());
    expect(byClass).toBe(byToken); // same single instance
    expect(byClass.isInitialized).toBe(true);
  });
});
