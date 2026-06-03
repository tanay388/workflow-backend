import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { AuditLog } from '../common/audit/audit-log.entity';
import { Membership } from '../iam/entities/membership.entity';
import { Organization } from '../iam/entities/organization.entity';
import { Plan } from '../iam/entities/plan.entity';
import { Workspace } from '../iam/entities/workspace.entity';
import { MeteringModule } from '../metering/metering.module';
import { ModelsModule } from '../models/models.module';
import { WorkflowRun } from '../runs/entities/workflow-run.entity';
import { AdminAdminsService } from './admin-admins.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminHealthService } from './admin-health.service';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminModelsService } from './admin-models.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminOrgsService } from './admin-orgs.service';
import { AdminPlansService } from './admin-plans.service';
import { AdminController } from './admin.controller';
import { PlatformAdmin } from './entities/platform-admin.entity';
import { PlatformAdminGuard } from './guards/platform-admin.guard';
import { PlatformStepUpService } from './platform-step-up.service';
import { UsageDaily } from '../metering/entities/usage-daily.entity';

@Module({
  imports: [
    AuthModule,
    MeteringModule,
    ModelsModule,
    TypeOrmModule.forFeature([
      PlatformAdmin,
      Organization,
      Plan,
      Membership,
      Workspace,
      User,
      AuditLog,
      WorkflowRun,
      UsageDaily,
    ]),
    JwtModule.register({}),
  ],
  controllers: [AdminController],
  providers: [
    AdminAuthService,
    AdminOrgsService,
    AdminPlansService,
    AdminModelsService,
    AdminAdminsService,
    AdminAuditService,
    AdminMetricsService,
    AdminHealthService,
    PlatformStepUpService,
    PlatformAdminGuard,
    { provide: APP_GUARD, useClass: PlatformAdminGuard },
  ],
})
export class AdminModule {}
