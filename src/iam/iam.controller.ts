import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth.types';
import { AuditService } from '../common/audit/audit.service';
import { CurrentTenancy } from '../common/decorators/current-tenancy.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SkipTenancy } from '../common/decorators/skip-tenancy.decorator';
import { MemberRole } from '../common/rbac/roles';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import {
  AuditLogQueryDto,
  ChangeRoleDto,
  CreateOrgDto,
  CreateWorkspaceDto,
  InviteMemberDto,
} from './dto/iam.dto';
import { InvitationsService } from './invitations.service';
import { MembershipsService } from './memberships.service';
import { OrganizationsService } from './organizations.service';
import { WorkspacesService } from './workspaces.service';

@ApiTags('iam')
@Controller()
export class IamController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly workspaces: WorkspacesService,
    private readonly members: MembershipsService,
    private readonly invitations: InvitationsService,
    private readonly audit: AuditService,
  ) {}

  @SkipTenancy()
  @Post('orgs')
  createOrg(@CurrentUser() user: AuthUser, @Body() dto: CreateOrgDto) {
    return this.orgs.create(user.id, dto.name);
  }

  @SkipTenancy()
  @Get('orgs')
  listOrgs(@CurrentUser() user: AuthUser) {
    return this.orgs.listForUser(user.id);
  }

  @Get('orgs/:id')
  async getOrg(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const org = await this.orgs.getForMember(id, user.id);
    if (!org) throw new ForbiddenException('You are not a member of this organization');
    return org;
  }

  @Roles(MemberRole.ADMIN)
  @Post('orgs/:id/workspaces')
  createWorkspace(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') orgId: string,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspaces.create(orgId, tenancy.userId!, dto.name);
  }

  @Get('orgs/:id/workspaces')
  listOrgWorkspaces(@Param('id') orgId: string) {
    return this.workspaces.listForOrg(orgId);
  }

  @Get('workspaces')
  listWorkspaces(@CurrentTenancy() tenancy: Tenancy) {
    return this.workspaces.listForOrg(tenancy.orgId!);
  }

  @Roles(MemberRole.ADMIN)
  @Post('orgs/:id/invitations')
  invite(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') orgId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.invitations.create(orgId, tenancy.userId!, dto.email, dto.role);
  }

  @Get('orgs/:id/invitations')
  listInvitations(@Param('id') orgId: string) {
    return this.invitations.listPending(orgId);
  }

  @Roles(MemberRole.ADMIN)
  @Post('orgs/:id/invitations/:invitationId/resend')
  resendInvitation(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') orgId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitations.resend(orgId, invitationId, tenancy.userId!);
  }

  @Roles(MemberRole.ADMIN)
  @Delete('orgs/:id/invitations/:invitationId')
  revokeInvitation(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') orgId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitations.revoke(orgId, invitationId, tenancy.userId!);
  }

  @Public()
  @SkipTenancy()
  @Get('invitations/:token')
  previewInvite(@Param('token') token: string) {
    return this.invitations.preview(token);
  }

  @SkipTenancy()
  @Post('invitations/:token/accept')
  acceptInvite(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.invitations.accept(token, user.id, user.email);
  }

  @Get('orgs/:id/members')
  listMembers(@Param('id') orgId: string) {
    return this.members.listForOrg(orgId);
  }

  @Roles(MemberRole.ADMIN)
  @Patch('members/:id/role')
  changeRole(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') memberId: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.members.changeRole(tenancy.orgId!, memberId, tenancy.userId!, dto.role);
  }

  @Roles(MemberRole.ADMIN)
  @Delete('members/:id')
  removeMember(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') memberId: string,
  ) {
    return this.members.removeMember(tenancy.orgId!, memberId, tenancy.userId!);
  }

  @Get('orgs/:id/audit-logs')
  auditLogs(@Param('id') orgId: string, @Query() query: AuditLogQueryDto) {
    return this.audit.listForOrg(orgId, {
      actorUserId: query.actorUserId,
      action: query.action,
      targetType: query.targetType,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page,
      limit: query.limit,
    });
  }
}
