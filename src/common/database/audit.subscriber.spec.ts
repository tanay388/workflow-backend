import type { DataSource } from 'typeorm';
import type { TenancyContextService } from '../tenancy/tenancy-context.service';
import { AuditSubscriber } from './audit.subscriber';

function makeSubscriber(current: Record<string, unknown>) {
  const subscribers: unknown[] = [];
  const dataSource = { subscribers } as unknown as DataSource;
  const tenancy = { current } as unknown as TenancyContextService;
  const subscriber = new AuditSubscriber(dataSource, tenancy);
  return { subscriber, subscribers };
}

const withAuditColumns = {
  metadata: { columns: [{ propertyName: 'id' }, { propertyName: 'createdBy' }] },
};

describe('AuditSubscriber', () => {
  it('self-registers with the DataSource', () => {
    const { subscriber, subscribers } = makeSubscriber({ userId: 'u1' });
    expect(subscribers).toContain(subscriber);
  });

  it('stamps createdBy + updatedBy on insert from the active tenancy', () => {
    const { subscriber } = makeSubscriber({ userId: 'u1' });
    const entity: Record<string, unknown> = {};
    subscriber.beforeInsert({ ...withAuditColumns, entity } as never);
    expect(entity.createdBy).toBe('u1');
    expect(entity.updatedBy).toBe('u1');
  });

  it('stamps only updatedBy on update, preserving createdBy', () => {
    const { subscriber } = makeSubscriber({ userId: 'u2' });
    const entity: Record<string, unknown> = { createdBy: 'orig' };
    subscriber.beforeUpdate({ ...withAuditColumns, entity } as never);
    expect(entity.updatedBy).toBe('u2');
    expect(entity.createdBy).toBe('orig');
  });

  it('no-ops when the tenancy context is empty', () => {
    const { subscriber } = makeSubscriber({});
    const entity: Record<string, unknown> = {};
    subscriber.beforeInsert({ ...withAuditColumns, entity } as never);
    expect(entity.createdBy).toBeUndefined();
  });

  it('no-ops on entities without audit columns', () => {
    const { subscriber } = makeSubscriber({ userId: 'u1' });
    const entity: Record<string, unknown> = {};
    subscriber.beforeInsert({
      metadata: { columns: [{ propertyName: 'id' }] },
      entity,
    } as never);
    expect(entity.createdBy).toBeUndefined();
  });
});
