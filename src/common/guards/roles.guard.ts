import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { SKIP_TENANCY_KEY } from '../decorators/skip-tenancy.decorator';
import { hasMinimumRole, type MemberRole } from '../rbac/roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

    const required = this.reflector.getAllAndOverride<MemberRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<{ tenancy?: { role?: string } }>();
    const role = request.tenancy?.role;
    if (!role) throw new ForbiddenException('Role context required');

    const allowed = required.some((r) => hasMinimumRole(role, r));
    if (!allowed) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
