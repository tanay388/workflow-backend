import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { Membership } from '../iam/entities/membership.entity';
import { Organization } from '../iam/entities/organization.entity';
import { ModelsModule } from '../models/models.module';
import { RunStep } from '../runs/entities/run-step.entity';
import { WorkflowRun } from '../runs/entities/workflow-run.entity';
import { AlertSweepService } from './alert-sweep.service';
import { TokenUsage } from './entities/token-usage.entity';
import { UsageAlert } from './entities/usage-alert.entity';
import { UsageDaily } from './entities/usage-daily.entity';
import { CreditTransaction } from './entities/credit-transaction.entity';
import { CreditLedgerService } from './credit-ledger.service';
import { MeterGuard } from './meter-guard.service';
import { METERING_SERVICE } from './metering.types';
import { MeteringServiceImpl } from './metering.service';
import { OrgLimitsService } from './org-limits.service';
import { UsageController } from './usage.controller';
import { UsageQueryService } from './usage-query.service';

@Module({
  imports: [
    ModelsModule,
    TypeOrmModule.forFeature([
      TokenUsage,
      UsageDaily,
      UsageAlert,
      CreditTransaction,
      RunStep,
      WorkflowRun,
      Organization,
      Membership,
      User,
    ]),
  ],
  controllers: [UsageController],
  providers: [
    MeteringServiceImpl,
    { provide: METERING_SERVICE, useExisting: MeteringServiceImpl },
    MeterGuard,
    UsageQueryService,
    OrgLimitsService,
    AlertSweepService,
    CreditLedgerService,
  ],
  exports: [
    MeteringServiceImpl,
    METERING_SERVICE,
    MeterGuard,
    UsageQueryService,
    OrgLimitsService,
    AlertSweepService,
    CreditLedgerService,
  ],
})
export class MeteringModule {}
