import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../common/audit/audit.service';
import { MemberRole } from '../common/rbac/roles';
import { Membership, MembershipStatus } from './entities/membership.entity';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    private readonly audit: AuditService,
  ) {}

  async listForOrg(orgId: string) {
    return this.memberships.find({
      where: { orgId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
  }

  async changeRole(orgId: string, memberId: string, actorId: string, role: MemberRole) {
    return this.memberships.manager.transaction(async (em) => {
      const repo = em.getRepository(Membership);
      const member = await repo.findOne({ where: { id: memberId, orgId } });
      if (!member) throw new NotFoundException('Member not found');

      if (member.role === MemberRole.OWNER && role !== MemberRole.OWNER) {
        await this.assertNotSoleOwner(repo, orgId, member.id);
      }

      const previous = member.role;
      member.role = role;
      member.updatedBy = actorId;
      await repo.save(member);

      await this.audit.record({
        orgId,
        actorUserId: actorId,
        action: 'member.role_changed',
        targetType: 'membership',
        targetId: member.id,
        meta: { from: previous, to: role, userId: member.userId },
      });

      return member;
    });
  }

  async removeMember(orgId: string, memberId: string, actorId: string) {
    return this.memberships.manager.transaction(async (em) => {
      const repo = em.getRepository(Membership);
      const member = await repo.findOne({ where: { id: memberId, orgId } });
      if (!member) throw new NotFoundException('Member not found');

      if (member.role === MemberRole.OWNER) {
        await this.assertNotSoleOwner(repo, orgId, member.id);
      }

      member.status = MembershipStatus.DISABLED;
      member.updatedBy = actorId;
      await repo.save(member);

      await this.audit.record({
        orgId,
        actorUserId: actorId,
        action: 'member.removed',
        targetType: 'membership',
        targetId: member.id,
        meta: { userId: member.userId },
      });

      return member;
    });
  }

  private async assertNotSoleOwner(
    repo: Repository<Membership>,
    orgId: string,
    memberId: string,
  ) {
    const owners = await repo.count({
      where: { orgId, role: MemberRole.OWNER, status: MembershipStatus.ACTIVE },
    });
    if (owners <= 1) {
      const member = await repo.findOne({ where: { id: memberId } });
      if (member?.role === MemberRole.OWNER) {
        throw new BadRequestException('Cannot demote or remove the sole owner');
      }
    }
  }
}
