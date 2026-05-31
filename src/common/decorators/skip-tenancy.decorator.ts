import { SetMetadata } from '@nestjs/common';

export const SKIP_TENANCY_KEY = 'skipTenancy';

/** Skip TenancyGuard — auth routes, org list/create, public health, etc. */
export const SkipTenancy = () => SetMetadata(SKIP_TENANCY_KEY, true);
