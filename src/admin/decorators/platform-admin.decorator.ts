import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PlatformAdminUser } from '../types/platform-admin.types';

export const PLATFORM_ROUTE_KEY = 'platformRoute';
export const PLATFORM_WRITE_KEY = 'platformWrite';
export const PLATFORM_STEP_UP_KEY = 'platformStepUp';

/** Marks a route as platform-admin only (skips tenant JWT + tenancy). */
export const PlatformRoute = () => SetMetadata(PLATFORM_ROUTE_KEY, true);

/** Requires superadmin role for write operations. */
export const PlatformWrite = () => SetMetadata(PLATFORM_WRITE_KEY, true);

/** Requires a short-lived confirm token from step-up re-auth (X-Confirm-Token). */
export const PlatformStepUp = () => SetMetadata(PLATFORM_STEP_UP_KEY, true);

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformAdminUser => {
    const request = ctx.switchToHttp().getRequest<{ platformAdmin?: PlatformAdminUser }>();
    return request.platformAdmin!;
  },
);
