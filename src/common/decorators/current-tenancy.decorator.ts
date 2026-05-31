import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Tenancy } from '../tenancy/tenancy-context.service';

export const CurrentTenancy = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Tenancy => {
    const request = ctx.switchToHttp().getRequest<{ tenancy: Tenancy }>();
    return request.tenancy;
  },
);
