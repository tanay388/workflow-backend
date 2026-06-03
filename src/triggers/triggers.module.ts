import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalsModule } from '../approvals/approvals.module';
import { TriggerSubscription } from '../approvals/entities/trigger-subscription.entity';
import { Connection } from '../connections/entities/connection.entity';
import { ConnectionsModule } from '../connections/connections.module';
import { RunsModule } from '../runs/runs.module';
import { Workflow } from '../workflows/entities/workflow.entity';
import { WorkflowRun } from '../runs/entities/workflow-run.entity';
import { InboundWebhook } from './entities/inbound-webhook.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WorkflowTriggerLink } from './entities/workflow-trigger.entity';
import { InboundWebhookService } from './inbound-webhook.service';
import { TriggerIngestService } from './trigger-ingest.service';
import { TriggerSubscriptionService } from './trigger-subscription.service';
import {
  TriggersController,
  WorkflowTriggerLinksController,
  WorkflowTriggersController,
} from './triggers.controller';
import { WebhooksController } from './webhooks.controller';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { ComposioSignatureVerifier } from './verifiers/composio-signature.verifier';
import { HmacVerifier } from './verifiers/hmac.verifier';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TriggerSubscription,
      InboundWebhook,
      WorkflowTriggerLink,
      WebhookDelivery,
      Connection,
      Workflow,
      WorkflowRun,
    ]),
    ConnectionsModule,
    forwardRef(() => RunsModule),
    forwardRef(() => ApprovalsModule),
  ],
  controllers: [
    WorkflowTriggersController,
    TriggersController,
    WorkflowTriggerLinksController,
    WebhooksController,
  ],
  providers: [
    TriggerIngestService,
    TriggerSubscriptionService,
    InboundWebhookService,
    WorkflowTriggerService,
    ComposioSignatureVerifier,
    HmacVerifier,
  ],
  exports: [TriggerIngestService, WorkflowTriggerService],
})
export class TriggersModule {}
