import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { TenancyGuard } from './guards/tenancy.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Invitation } from './entities/invitation.entity';
import { Membership } from './entities/membership.entity';
import { Organization } from './entities/organization.entity';
import { Plan } from './entities/plan.entity';
import { Workspace } from './entities/workspace.entity';
import { IamController } from './iam.controller';
import { InvitationsService } from './invitations.service';
import { MembershipsService } from './memberships.service';
import { OrganizationsService } from './organizations.service';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Plan,
      Organization,
      Workspace,
      Membership,
      Invitation,
      User,
    ]),
  ],
  controllers: [IamController],
  providers: [
    OrganizationsService,
    WorkspacesService,
    MembershipsService,
    InvitationsService,
    { provide: APP_GUARD, useClass: TenancyGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [
    OrganizationsService,
    WorkspacesService,
    MembershipsService,
    InvitationsService,
    TypeOrmModule,
  ],
})
export class IamModule {}
