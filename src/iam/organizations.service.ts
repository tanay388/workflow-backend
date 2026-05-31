import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../common/audit/audit.service';
import { MemberRole } from '../common/rbac/roles';
import { slugify } from '../common/utils/text';
import { Membership, MembershipStatus } from './entities/membership.entity';
import { Organization } from './entities/organization.entity';
import { Workspace } from './entities/workspace.entity';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgs: Repository<Organization>,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, name: string) {
    return this.orgs.manager.transaction(async (em) => {
      const orgRepo = em.getRepository(Organization);
      const memberRepo = em.getRepository(Membership);
      const baseSlug = slugify(name) || 'org';
      let slug = baseSlug;
      let n = 1;
      while (await orgRepo.findOne({ where: { slug } })) {
        slug = `${baseSlug}-${n++}`;
      }

      const org = await orgRepo.save(
        orgRepo.create({
          name,
          slug,
          planId: '00000000-0000-4000-8000-000000000001',
          createdBy: userId,
          updatedBy: userId,
        }),
      );

      const workspaceRepo = em.getRepository(Workspace);
      const workspace = await workspaceRepo.save(
        workspaceRepo.create({
          orgId: org.id,
          name: 'General',
          slug: 'general',
          createdBy: userId,
          updatedBy: userId,
        }),
      );

      const membership = await memberRepo.save(
        memberRepo.create({
          userId,
          orgId: org.id,
          role: MemberRole.OWNER,
          status: MembershipStatus.ACTIVE,
          createdBy: userId,
          updatedBy: userId,
        }),
      );

      await this.audit.record({
        orgId: org.id,
        actorUserId: userId,
        action: 'org.created',
        targetType: 'organization',
        targetId: org.id,
        meta: { name: org.name },
      });

      return { org, membership, workspace };
    });
  }

  async listForUser(userId: string) {
    const memberships = await this.memberships.find({
      where: { userId, status: MembershipStatus.ACTIVE },
      relations: { org: true },
    });
    return memberships.map((m) => ({
      ...m.org,
      role: m.role,
      membershipId: m.id,
    }));
  }

  async getForMember(orgId: string, userId: string) {
    const membership = await this.memberships.findOne({
      where: { orgId, userId, status: MembershipStatus.ACTIVE },
      relations: { org: true },
    });
    if (!membership) return null;
    return { ...membership.org, role: membership.role, membershipId: membership.id };
  }
}
