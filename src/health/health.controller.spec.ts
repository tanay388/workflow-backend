import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('GET /health always returns ok', () => {
    const controller = new HealthController({} as unknown as DataSource);
    expect(controller.health()).toEqual({ status: 'ok' });
  });

  it('GET /ready returns ready when the DB responds', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ ok: 1 }]) } as unknown as DataSource;
    const controller = new HealthController(dataSource);
    await expect(controller.ready()).resolves.toEqual({ status: 'ready' });
  });

  it('GET /ready throws 503 when the DB is unreachable', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as DataSource;
    const controller = new HealthController(dataSource);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
