import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { SKIP_TENANCY_KEY } from '../../common/decorators/skip-tenancy.decorator';
import { PLATFORM_ROUTE_KEY } from '../../admin/decorators/platform-admin.decorator';
import {
  TenancyContextService,
  type Tenancy,
} from '../../common/tenancy/tenancy-context.service';
import { Workflow } from '../../workflows/entities/workflow.entity';
import { Membership, MembershipStatus } from '../entities/membership.entity';
import { Workspace } from '../entities/workspace.entity';

@Injectable()
export class TenancyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenancy: TenancyContextService,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    @InjectRepository(Workflow)
    private readonly workflows: Repository<Workflow>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skipTenancy = this.reflector.getAllAndOverride<boolean>(SKIP_TENANCY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipTenancy) return true;

    const isPlatformRoute = this.reflector.getAllAndOverride<boolean>(PLATFORM_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPlatformRoute) return true;

    const request = context.switchToHttp().getRequest<{
      user?: { id: string };
      params: Record<string, string>;
      headers: Record<string, string | string[] | undefined>;
      query?: Record<string, string | string[] | undefined>;
      tenancy?: Tenancy;
      url: string;
    }>();

    const userId = request.user?.id;
    if (!userId) throw new ForbiddenException('Authentication required');

    this.tenancy.set({ userId });

    if (skipTenancy) return true;

    const orgId = await this.resolveOrgId(request);
    if (!orgId) throw new ForbiddenException('Organization context required');

    const membership = await this.memberships.findOne({
      where: { userId, orgId, status: MembershipStatus.ACTIVE },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    const workspaceHeader =
      this.header(request, 'x-workspace-id') ?? this.queryParam(request, 'workspace_id');
    let workspaceId: string | undefined;
    if (workspaceHeader) {
      const workspace = await this.workspaces.findOne({ where: { id: workspaceHeader } });
      if (!workspace || workspace.orgId !== orgId) {
        throw new ForbiddenException('Invalid workspace for this organization');
      }
      workspaceId = workspace.id;
    }

    const resolved: Tenancy = {
      userId,
      orgId,
      workspaceId,
      role: membership.role,
    };
    this.tenancy.set(resolved);
    request.tenancy = resolved;
    return true;
  }

  private async resolveOrgId(request: {
    params: Record<string, string>;
    url: string;
    headers: Record<string, string | string[] | undefined>;
    query?: Record<string, string | string[] | undefined>;
  }): Promise<string | undefined> {
    const workspaceHeader =
      this.header(request, 'x-workspace-id') ?? this.queryParam(request, 'workspace_id');
    if (workspaceHeader) {
      const workspace = await this.workspaces.findOne({ where: { id: workspaceHeader } });
      if (workspace) return workspace.orgId;
    }

    if (request.url.includes('/members/') && request.params.id) {
      const member = await this.memberships.findOne({ where: { id: request.params.id } });
      return member?.orgId;
    }

    if (request.url.includes('/orgs/') && request.params.id) {
      return request.params.id;
    }

    if (request.url.includes('/workflows/') && request.params.id) {
      const wf = await this.workflows.findOne({ where: { id: request.params.id } });
      return wf?.orgId;
    }

    return undefined;
  }

  private header(
    request: { headers: Record<string, string | string[] | undefined> },
    name: string,
  ): string | undefined {
    const value = request.headers[name];
    if (Array.isArray(value)) return value[0];
    return value;
  }

  private queryParam(
    request: { query?: Record<string, string | string[] | undefined> },
    name: string,
  ): string | undefined {
    const value = request.query?.[name];
    if (Array.isArray(value)) return value[0];
    return typeof value === 'string' ? value : undefined;
  }
}
