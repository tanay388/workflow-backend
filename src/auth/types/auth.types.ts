export interface JwtPayload {
  sub: string;
  org_id: string | null;
  workspace_id: string | null;
  role: string | null;
  aud?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: AuthUser;
}
