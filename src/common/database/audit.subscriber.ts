import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  type EntitySubscriberInterface,
  type InsertEvent,
  type SoftRemoveEvent,
  type UpdateEvent,
} from 'typeorm';
import { TenancyContextService } from '../tenancy/tenancy-context.service';

/**
 * Stamps `created_by` / `updated_by` / `deleted_by` from the active tenancy
 * (TRD §3.1, §4 audit convention). Singleton subscriber that reads the
 * request's tenancy via AsyncLocalStorage; no-ops when there is no actor
 * (CLI/system writes, or Phase 01's empty context).
 */
@Injectable()
export class AuditSubscriber implements EntitySubscriberInterface {
  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly tenancy: TenancyContextService,
  ) {
    // Self-register so this DI-managed instance receives entity events.
    dataSource.subscribers.push(this);
  }

  private hasAuditColumns(event: { metadata: { columns: { propertyName: string }[] } }): boolean {
    return event.metadata.columns.some((c) => c.propertyName === 'createdBy');
  }

  beforeInsert(event: InsertEvent<Record<string, unknown>>): void {
    const userId = this.tenancy.current.userId;
    if (!userId || !event.entity || !this.hasAuditColumns(event)) return;
    if (event.entity.createdBy == null) event.entity.createdBy = userId;
    event.entity.updatedBy = userId;
  }

  beforeUpdate(event: UpdateEvent<Record<string, unknown>>): void {
    const userId = this.tenancy.current.userId;
    if (!userId || !event.entity || !this.hasAuditColumns(event)) return;
    event.entity.updatedBy = userId;
  }

  beforeSoftRemove(event: SoftRemoveEvent<Record<string, unknown>>): void {
    const userId = this.tenancy.current.userId;
    if (!userId || !event.entity || !this.hasAuditColumns(event)) return;
    event.entity.deletedBy = userId;
  }
}
