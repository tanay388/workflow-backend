import { SetMetadata } from '@nestjs/common';
import type { MemberRole } from '../rbac/roles';

export const ROLES_KEY = 'roles';

/** Minimum role required (owner > admin > editor > viewer). */
export const Roles = (...roles: MemberRole[]) => SetMetadata(ROLES_KEY, roles);
