import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
import { IamModule } from './iam/iam.module';
import { CredentialsModule } from './credentials/credentials.module';
import { EditorModule } from './editor/editor.module';
import { ConnectionsModule } from './connections/connections.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { TriggersModule } from './triggers/triggers.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { ChatModule } from './chat/chat.module';
import { FormsModule } from './forms/forms.module';
import { RunsModule } from './runs/runs.module';
import { WidgetsModule } from './widgets/widgets.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { MeteringModule } from './metering/metering.module';
import { AdminModule } from './admin/admin.module';
import { ModelsModule } from './models/models.module';

/**
 * Root module. CommonModule provides all cross-cutting infrastructure
 * (config, logging, db, crypto, email, tenancy). Feature modules (auth, iam,
 * workflows, …) are added in their respective phases.
 */
@Module({
  imports: [
    CommonModule,
    HealthModule,
    AuthModule,
    IamModule,
    EditorModule,
    WorkflowsModule,
    RunsModule,
    ChatModule,
    FormsModule,
    WidgetsModule,
    ApprovalsModule,
    SchedulerModule,
    TriggersModule,
    CredentialsModule,
    ConnectionsModule,
    KnowledgeModule,
    MeteringModule,
    ModelsModule,
    AdminModule,
  ],
})
export class AppModule {}
