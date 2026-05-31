export enum MemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

const ROLE_RANK: Record<MemberRole, number> = {
  [MemberRole.OWNER]: 4,
  [MemberRole.ADMIN]: 3,
  [MemberRole.EDITOR]: 2,
  [MemberRole.VIEWER]: 1,
};

/** True when `actual` meets or exceeds `required` in owner > admin > editor > viewer order. */
export function hasMinimumRole(actual: string, required: MemberRole | string): boolean {
  const a = ROLE_RANK[actual as MemberRole] ?? 0;
  const r = ROLE_RANK[required as MemberRole] ?? 0;
  return a >= r;
}
