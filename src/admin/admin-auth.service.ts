import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { AuditActorType } from '../common/audit/audit-log.entity';
import { AuditService } from '../common/audit/audit.service';
import { AppConfigService } from '../common/config/config.service';
import { MemberRole } from '../common/rbac/roles';
import { Membership, MembershipStatus } from '../iam/entities/membership.entity';
import { User } from '../auth/entities/user.entity';
import { Workspace } from '../iam/entities/workspace.entity';
import { Organization } from '../iam/entities/organization.entity';
import { PlatformAdmin, PlatformAdminRole } from './entities/platform-admin.entity';
import type {
  PlatformAdminUser,
  PlatformAuthResponse,
  PlatformJwtPayload,
} from './types/platform-admin.types';

@Injectable()
export class AdminAuthService implements OnModuleInit {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @InjectRepository(PlatformAdmin) private readonly admins: Repository<PlatformAdmin>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(Workspace) private readonly workspaces: Repository<Workspace>,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly tenantTokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.admins.count();
    if (count > 0) return;

    const boot = this.config.platformAdminBootstrap;
    if (!boot.email || !boot.password) {
      this.logger.warn(
        'No platform admins — set PLATFORM_ADMIN_EMAIL/PASSWORD to bootstrap one',
      );
      return;
    }

    await this.admins.save(
      this.admins.create({
        email: boot.email.toLowerCase(),
        passwordHash: await this.passwords.hash(boot.password),
        name: boot.name,
        role: PlatformAdminRole.SUPERADMIN,
      }),
    );
    this.logger.log(`Bootstrapped platform admin ${boot.email}`);
  }

  async login(email: string, password: string): Promise<PlatformAuthResponse> {
    const admin = await this.admins.findOne({
      where: { email: email.toLowerCase() },
    });
    if (!admin || !admin.isActive || !(await this.passwords.verify(admin.passwordHash, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    admin.lastLoginAt = new Date();
    await this.admins.save(admin);

    return {
      accessToken: this.signPlatformToken(admin),
      admin: this.toUser(admin),
    };
  }

  async getById(id: string): Promise<PlatformAdmin | null> {
    const admin = await this.admins.findOne({ where: { id } });
    if (!admin || !admin.isActive) return null;
    return admin;
  }

  signPlatformToken(admin: PlatformAdmin): string {
    const payload: PlatformJwtPayload = {
      sub: admin.id,
      role: admin.role,
      aud: 'platform',
    };
    return this.jwt.sign(payload, {
      secret: this.config.jwt.platformSecret,
      expiresIn: this.config.jwt.platformExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });
  }

  toUser(admin: PlatformAdmin): PlatformAdminUser {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
  }

  async impersonateOrg(admin: PlatformAdminUser, org: Organization) {
    const membership = await this.memberships.findOne({
      where: { orgId: org.id, status: MembershipStatus.ACTIVE, role: MemberRole.ADMIN },
    });
    let userId = membership?.userId ?? null;
    if (!userId) {
      const owner = await this.memberships.findOne({
        where: { orgId: org.id, status: MembershipStatus.ACTIVE, role: MemberRole.OWNER },
      });
      userId = owner?.userId ?? null;
    }
    if (!userId) {
      const anyMember = await this.memberships.findOne({
        where: { orgId: org.id, status: MembershipStatus.ACTIVE },
      });
      userId = anyMember?.userId ?? null;
    }
    if (!userId) throw new UnauthorizedException('Organization has no active members');

    const workspace = await this.workspaces.findOne({ where: { orgId: org.id } });
    if (!workspace) throw new UnauthorizedException('Organization has no workspace');

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Member user not found');

    const accessToken = this.tenantTokens.signAccessToken(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerifiedAt: user.emailVerifiedAt,
      },
      { orgId: org.id, workspaceId: workspace.id, role: MemberRole.ADMIN },
    );

    await this.audit.record({
      orgId: org.id,
      actorType: AuditActorType.PLATFORM_ADMIN,
      action: 'platform.impersonate',
      targetType: 'organization',
      targetId: org.id,
      meta: { platformAdminId: admin.id },
    });

    return { accessToken, orgId: org.id, workspaceId: workspace.id };
  }
}
