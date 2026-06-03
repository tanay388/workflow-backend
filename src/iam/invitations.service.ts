import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AppConfigService } from '../common/config/config.service';
import { AuditService } from '../common/audit/audit.service';
import { EmailService } from '../common/email/email.service';
import { MemberRole } from '../common/rbac/roles';
import { parseDurationToMs } from '../common/utils/time';
import { randomToken } from '../common/utils/ids';
import { User } from '../auth/entities/user.entity';
import { Invitation } from './entities/invitation.entity';
import { Membership, MembershipStatus } from './entities/membership.entity';
import { Organization } from './entities/organization.entity';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation)
    private readonly invitations: Repository<Invitation>,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    @InjectRepository(Organization)
    private readonly orgs: Repository<Organization>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly email: EmailService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  async listPending(orgId: string) {
    const rows = await this.invitations.find({
      where: { orgId, acceptedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    const now = new Date();
    return rows.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      expired: inv.expiresAt <= now,
    }));
  }

  async create(orgId: string, actorId: string, email: string, role: MemberRole) {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const normalized = email.toLowerCase();
    const existingUser = await this.users.findOne({ where: { email: normalized } });
    if (existingUser) {
      const existingMember = await this.memberships.findOne({
        where: { orgId, userId: existingUser.id },
      });
      if (existingMember?.status === MembershipStatus.ACTIVE) {
        existingMember.role = role;
        existingMember.updatedBy = actorId;
        await this.memberships.save(existingMember);
        await this.audit.record({
          orgId,
          actorUserId: actorId,
          action: 'member.role_changed',
          targetType: 'membership',
          targetId: existingMember.id,
          meta: { via: 'reinvite', role },
        });
        return { updated: true, membership: existingMember };
      }
    }

    const pending = await this.invitations.findOne({
      where: { orgId, email: normalized, acceptedAt: IsNull() },
    });
    if (pending) {
      pending.role = role;
      return this.resendExisting(org, pending, actorId, 'invitation.sent');
    }

    const token = randomToken(24);
    const expiresAt = this.newExpiresAt();

    const invitation = await this.invitations.save(
      this.invitations.create({
        orgId,
        email: normalized,
        role,
        token,
        expiresAt,
        acceptedAt: null,
      }),
    );

    const acceptUrl = await this.deliverInvitationEmail(org, invitation);

    await this.audit.record({
      orgId,
      actorUserId: actorId,
      action: 'invitation.sent',
      targetType: 'invitation',
      targetId: invitation.id,
      meta: { email: normalized, role },
    });

    return { invitation, acceptUrl };
  }

  async resend(orgId: string, invitationId: string, actorId: string) {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const invitation = await this.findPendingInvitation(orgId, invitationId);
    return this.resendExisting(org, invitation, actorId, 'invitation.resent');
  }

  async revoke(orgId: string, invitationId: string, actorId: string) {
    const invitation = await this.findPendingInvitation(orgId, invitationId);
    await this.invitations.remove(invitation);

    await this.audit.record({
      orgId,
      actorUserId: actorId,
      action: 'invitation.revoked',
      targetType: 'invitation',
      targetId: invitation.id,
      meta: { email: invitation.email, role: invitation.role },
    });

    return { revoked: true };
  }

  async preview(token: string) {
    const invitation = await this.findValidInvitation(token);
    const org = await this.orgs.findOne({ where: { id: invitation.orgId } });
    return {
      orgName: org?.name ?? 'Organization',
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    };
  }

  async accept(token: string, userId: string, userEmail: string) {
    return this.invitations.manager.transaction(async (em) => {
      const inviteRepo = em.getRepository(Invitation);
      const memberRepo = em.getRepository(Membership);

      const invitation = await inviteRepo.findOne({ where: { token, acceptedAt: IsNull() } });
      if (!invitation) throw new NotFoundException('Invitation not found');
      if (invitation.expiresAt <= new Date()) {
        throw new BadRequestException('Invitation expired');
      }
      if (invitation.acceptedAt) throw new BadRequestException('Invitation already accepted');
      if (userEmail.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new UnauthorizedException('Invitation email does not match your account');
      }

      invitation.acceptedAt = new Date();
      await inviteRepo.save(invitation);

      let membership = await memberRepo.findOne({
        where: { orgId: invitation.orgId, userId },
      });

      if (membership) {
        membership.role = invitation.role;
        membership.status = MembershipStatus.ACTIVE;
        membership.userId = userId;
        membership.invitedEmail = null;
        membership.updatedBy = userId;
      } else {
        membership = memberRepo.create({
          orgId: invitation.orgId,
          userId,
          role: invitation.role,
          status: MembershipStatus.ACTIVE,
          createdBy: userId,
          updatedBy: userId,
        });
      }
      membership = await memberRepo.save(membership);

      await this.audit.record({
        orgId: invitation.orgId,
        actorUserId: userId,
        action: 'invitation.accepted',
        targetType: 'membership',
        targetId: membership.id,
        meta: { email: invitation.email, role: invitation.role },
      });

      const org = await em.getRepository(Organization).findOne({
        where: { id: invitation.orgId },
      });

      return { membership, org };
    });
  }

  private async findValidInvitation(token: string) {
    const invitation = await this.invitations.findOne({ where: { token } });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.acceptedAt) throw new BadRequestException('Invitation already accepted');
    if (invitation.expiresAt <= new Date()) throw new BadRequestException('Invitation expired');
    return invitation;
  }

  private async findPendingInvitation(orgId: string, invitationId: string) {
    const invitation = await this.invitations.findOne({
      where: { id: invitationId, orgId, acceptedAt: IsNull() },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    return invitation;
  }

  private newExpiresAt() {
    return new Date(Date.now() + parseDurationToMs(this.config.invitationExpiresIn));
  }

  private async deliverInvitationEmail(org: Organization, invitation: Invitation) {
    const acceptUrl = `${this.config.frontendUrl}/accept-invite/${invitation.token}`;
    await this.email.sendTemplate({
      to: invitation.email,
      subject: `Join ${org.name} on Growy`,
      template: 'invitation',
      context: {
        orgName: org.name,
        role: invitation.role,
        acceptUrl,
        expiresAt: invitation.expiresAt.toISOString(),
      },
    });
    return acceptUrl;
  }

  private async resendExisting(
    org: Organization,
    invitation: Invitation,
    actorId: string,
    auditAction: 'invitation.sent' | 'invitation.resent',
  ) {
    invitation.token = randomToken(24);
    invitation.expiresAt = this.newExpiresAt();
    await this.invitations.save(invitation);

    const acceptUrl = await this.deliverInvitationEmail(org, invitation);

    await this.audit.record({
      orgId: invitation.orgId,
      actorUserId: actorId,
      action: auditAction,
      targetType: 'invitation',
      targetId: invitation.id,
      meta: { email: invitation.email, role: invitation.role },
    });

    return {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        expired: false,
      },
      acceptUrl,
    };
  }
}
