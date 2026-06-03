import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PlatformAdmin } from '../../admin/entities/platform-admin.entity';
import { User } from '../../auth/entities/user.entity';
import { Invitation } from '../../iam/entities/invitation.entity';
import { Membership } from '../../iam/entities/membership.entity';
import { Organization } from '../../iam/entities/organization.entity';
import { Plan } from '../../iam/entities/plan.entity';
import { Workspace } from '../../iam/entities/workspace.entity';
import { LlmModel } from '../../models/entities/llm-model.entity';
import { AuditActorType, AuditLog } from './audit-log.entity';

export interface EnrichedAuditLog extends AuditLog {
  actorLabel: string | null;
  orgLabel: string | null;
  targetLabel: string | null;
}

@Injectable()
export class AuditDisplayService {
  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(Workspace) private readonly workspaces: Repository<Workspace>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    @InjectRepository(LlmModel) private readonly models: Repository<LlmModel>,
    @InjectRepository(PlatformAdmin) private readonly platformAdmins: Repository<PlatformAdmin>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(Invitation) private readonly invitations: Repository<Invitation>,
  ) {}

  async enrich(rows: AuditLog[]): Promise<EnrichedAuditLog[]> {
    if (rows.length === 0) return [];

    const orgIds = new Set<string>();
    const workspaceIds = new Set<string>();
    const userIds = new Set<string>();
    const planIds = new Set<string>();
    const modelIds = new Set<string>();
    const platformAdminIds = new Set<string>();
    const membershipIds = new Set<string>();
    const invitationIds = new Set<string>();

    for (const row of rows) {
      if (row.orgId) orgIds.add(row.orgId);
      if (row.actorUserId) userIds.add(row.actorUserId);

      const platformAdminId = row.meta?.platformAdminId;
      if (typeof platformAdminId === 'string') platformAdminIds.add(platformAdminId);

      if (row.targetId && row.targetType) {
        switch (row.targetType) {
          case 'organization':
            orgIds.add(row.targetId);
            break;
          case 'workspace':
            workspaceIds.add(row.targetId);
            break;
          case 'plan':
            planIds.add(row.targetId);
            break;
          case 'llm_model':
            modelIds.add(row.targetId);
            break;
          case 'platform_admin':
            platformAdminIds.add(row.targetId);
            break;
          case 'membership':
            membershipIds.add(row.targetId);
            break;
          case 'invitation':
            invitationIds.add(row.targetId);
            break;
          default:
            break;
        }
      }

      const metaUserId = row.meta?.userId;
      if (typeof metaUserId === 'string') userIds.add(metaUserId);
    }

    const [
      orgRows,
      workspaceRows,
      userRows,
      planRows,
      modelRows,
      adminRows,
      membershipRows,
      invitationRows,
    ] = await Promise.all([
      orgIds.size ? this.orgs.findBy({ id: In([...orgIds]) }) : [],
      workspaceIds.size ? this.workspaces.findBy({ id: In([...workspaceIds]) }) : [],
      userIds.size ? this.users.findBy({ id: In([...userIds]) }) : [],
      planIds.size ? this.plans.findBy({ id: In([...planIds]) }) : [],
      modelIds.size ? this.models.findBy({ id: In([...modelIds]) }) : [],
      platformAdminIds.size ? this.platformAdmins.findBy({ id: In([...platformAdminIds]) }) : [],
      membershipIds.size
        ? this.memberships.find({ where: { id: In([...membershipIds]) }, relations: { user: true } })
        : [],
      invitationIds.size ? this.invitations.findBy({ id: In([...invitationIds]) }) : [],
    ]);

    const orgMap = new Map(orgRows.map((o) => [o.id, o.name]));
    const workspaceMap = new Map(workspaceRows.map((w) => [w.id, w.name]));
    const userMap = new Map(userRows.map((u) => [u.id, u.name || u.email]));
    const planMap = new Map(planRows.map((p) => [p.id, p.name]));
    const modelMap = new Map(modelRows.map((m) => [m.id, m.displayName]));
    const adminMap = new Map(adminRows.map((a) => [a.id, a.name || a.email]));
    const membershipMap = new Map(
      membershipRows.map((m) => [
        m.id,
        m.user ? m.user.name || m.user.email : m.invitedEmail ?? 'Member',
      ]),
    );
    const invitationMap = new Map(invitationRows.map((i) => [i.id, i.email]));

    return rows.map((row) => ({
      ...row,
      orgLabel: row.orgId ? (orgMap.get(row.orgId) ?? null) : null,
      actorLabel: this.resolveActorLabel(row, userMap, adminMap),
      targetLabel: this.resolveTargetLabel(row, {
        orgMap,
        workspaceMap,
        userMap,
        planMap,
        modelMap,
        adminMap,
        membershipMap,
        invitationMap,
      }),
    }));
  }

  private resolveActorLabel(
    row: AuditLog,
    userMap: Map<string, string>,
    adminMap: Map<string, string>,
  ): string | null {
    if (row.actorType === AuditActorType.SYSTEM) return 'System';
    if (row.actorUserId) {
      return userMap.get(row.actorUserId) ?? null;
    }
    if (row.actorType === AuditActorType.PLATFORM_ADMIN) {
      const adminId = row.meta?.platformAdminId;
      if (typeof adminId === 'string') {
        return adminMap.get(adminId) ?? null;
      }
    }
    return null;
  }

  private resolveTargetLabel(
    row: AuditLog,
    maps: {
      orgMap: Map<string, string>;
      workspaceMap: Map<string, string>;
      userMap: Map<string, string>;
      planMap: Map<string, string>;
      modelMap: Map<string, string>;
      adminMap: Map<string, string>;
      membershipMap: Map<string, string>;
      invitationMap: Map<string, string>;
    },
  ): string | null {
    if (!row.targetType || !row.targetId) {
      if (row.meta?.name && typeof row.meta.name === 'string') return row.meta.name;
      if (row.meta?.email && typeof row.meta.email === 'string') return row.meta.email;
      return null;
    }

    const { targetType, targetId, meta } = row;

    switch (targetType) {
      case 'organization':
        return maps.orgMap.get(targetId) ?? 'Unknown organization';
      case 'workspace':
        return maps.workspaceMap.get(targetId) ?? 'Unknown workspace';
      case 'plan':
        return maps.planMap.get(targetId) ?? 'Unknown plan';
      case 'llm_model':
        return maps.modelMap.get(targetId) ?? 'Unknown model';
      case 'platform_admin':
        return maps.adminMap.get(targetId) ?? 'Unknown admin';
      case 'membership':
        return maps.membershipMap.get(targetId) ?? 'Unknown member';
      case 'invitation':
        return maps.invitationMap.get(targetId) ?? (typeof meta?.email === 'string' ? meta.email : 'Unknown invitation');
      case 'user':
        return maps.userMap.get(targetId) ?? 'Unknown user';
      default:
        if (typeof meta?.name === 'string') return meta.name;
        if (typeof meta?.email === 'string') return meta.email;
        return targetId.slice(0, 8) + '…';
    }
  }
}
