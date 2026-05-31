import { hasMinimumRole, MemberRole } from './roles';

describe('hasMinimumRole', () => {
  it('owner satisfies admin requirement', () => {
    expect(hasMinimumRole(MemberRole.OWNER, MemberRole.ADMIN)).toBe(true);
  });

  it('viewer fails editor requirement', () => {
    expect(hasMinimumRole(MemberRole.VIEWER, MemberRole.EDITOR)).toBe(false);
  });

  it('editor fails admin requirement', () => {
    expect(hasMinimumRole(MemberRole.EDITOR, MemberRole.ADMIN)).toBe(false);
  });
});
