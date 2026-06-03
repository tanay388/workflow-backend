import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformAdmin } from '../../admin/entities/platform-admin.entity';
import { User } from '../../auth/entities/user.entity';
import { Invitation } from '../../iam/entities/invitation.entity';
import { Membership } from '../../iam/entities/membership.entity';
import { Organization } from '../../iam/entities/organization.entity';
import { Plan } from '../../iam/entities/plan.entity';
import { Workspace } from '../../iam/entities/workspace.entity';
import { LlmModel } from '../../models/entities/llm-model.entity';
import { AuditDisplayService } from './audit-display.service';
import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuditLog,
      Organization,
      Workspace,
      User,
      Plan,
      LlmModel,
      PlatformAdmin,
      Membership,
      Invitation,
    ]),
  ],
  providers: [AuditService, AuditDisplayService],
  exports: [AuditService, AuditDisplayService, TypeOrmModule],
})
export class AuditModule {}
