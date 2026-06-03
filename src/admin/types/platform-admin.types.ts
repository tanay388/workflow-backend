import { PlatformAdminRole } from '../entities/platform-admin.entity';

export interface PlatformJwtPayload {
  sub: string;
  role: PlatformAdminRole;
  aud: 'platform';
}

export interface PlatformAdminUser {
  id: string;
  email: string;
  name: string;
  role: PlatformAdminRole;
}

export interface PlatformAuthResponse {
  accessToken: string;
  admin: PlatformAdminUser;
}

export interface ImpersonateResponse {
  accessToken: string;
  orgId: string;
  workspaceId: string;
}
