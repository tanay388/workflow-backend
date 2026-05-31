import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The resolved tenant identity for the current request (TRD §3).
 * In Phase 01 this is plumbing only — fields stay empty/undefined until
 * Phase 02/03 populate them from the JWT + X-Workspace-Id header.
 */
export interface Tenancy {
  userId?: string;
  orgId?: string;
  workspaceId?: string;
  role?: string;
}

/**
 * Request-scoped tenancy carried via AsyncLocalStorage so that singletons
 * (e.g. the {@link AuditSubscriber}, repositories) can read the current
 * request's tenant without request-scoped DI plumbing.
 *
 * Null-safe: outside a request (CLI, tests, worker boot) {@link current}
 * returns an empty object and consumers no-op.
 */
@Injectable()
export class TenancyContextService {
  private readonly als = new AsyncLocalStorage<Tenancy>();

  /** Run `fn` with `ctx` as the active tenancy for its async continuation. */
  run<T>(ctx: Tenancy, fn: () => T): T {
    return this.als.run(ctx, fn);
  }

  /** Mutate the active tenancy in place (used once the JWT is resolved). */
  set(patch: Partial<Tenancy>): void {
    const store = this.als.getStore();
    if (store) Object.assign(store, patch);
  }

  /** The active tenancy, or `{}` when there is no request scope. */
  get current(): Tenancy {
    return this.als.getStore() ?? {};
  }
}
