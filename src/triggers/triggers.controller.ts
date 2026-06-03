import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth.types';
import { CurrentTenancy } from '../common/decorators/current-tenancy.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MemberRole } from '../common/rbac/roles';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { CreateComposioTriggerDto, CreateWorkflowTriggerLinkDto, MintInboundWebhookDto } from './dto/trigger.dto';
import { InboundWebhookService } from './inbound-webhook.service';
import { TriggerSubscriptionService } from './trigger-subscription.service';
import { WorkflowTriggerService } from './workflow-trigger.service';

@ApiTags('triggers')
@Controller('workflows/:workflowId')
export class WorkflowTriggersController {
  constructor(
    private readonly subscriptions: TriggerSubscriptionService,
    private readonly inbound: InboundWebhookService,
    private readonly chains: WorkflowTriggerService,
  ) {}

  @Get('triggers')
  listTriggers(@CurrentTenancy() tenancy: Tenancy, @Param('workflowId') workflowId: string) {
    return this.subscriptions.listForWorkflow(tenancy, workflowId);
  }

  @Roles(MemberRole.EDITOR)
  @Post('triggers')
  createTrigger(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('workflowId') workflowId: string,
    @Body() dto: CreateComposioTriggerDto,
  ) {
    return this.subscriptions.create(tenancy, workflowId, user.id, dto);
  }

  @Get('inbound-webhook')
  getInboundWebhook(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('workflowId') workflowId: string,
  ) {
    return this.inbound.getForWorkflow(tenancy, workflowId);
  }

  @Roles(MemberRole.EDITOR)
  @Post('inbound-webhook')
  mintInboundWebhook(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('workflowId') workflowId: string,
    @Body() dto: MintInboundWebhookDto,
  ) {
    return this.inbound.mint(tenancy, workflowId, user.id, dto.regenerate ?? false);
  }

  @Get('workflow-triggers')
  listWorkflowChains(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('workflowId') workflowId: string,
  ) {
    return this.chains.listForSource(tenancy, workflowId);
  }
}

@ApiTags('triggers')
@Controller('triggers')
export class TriggersController {
  constructor(private readonly subscriptions: TriggerSubscriptionService) {}

  @Roles(MemberRole.EDITOR)
  @Delete(':id')
  removeTrigger(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.subscriptions.remove(tenancy, id, user.id);
  }

  @Roles(MemberRole.EDITOR)
  @Post(':id/test')
  testTrigger(@CurrentTenancy() tenancy: Tenancy, @Param('id') id: string) {
    return this.subscriptions.test(tenancy, id);
  }
}

@ApiTags('workflow-triggers')
@Controller('workflow-triggers')
export class WorkflowTriggerLinksController {
  constructor(private readonly chains: WorkflowTriggerService) {}

  @Roles(MemberRole.EDITOR)
  @Post()
  create(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWorkflowTriggerLinkDto,
  ) {
    return this.chains.create(tenancy, user.id, dto);
  }

  @Roles(MemberRole.EDITOR)
  @Delete(':id')
  remove(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.chains.remove(tenancy, id, user.id);
  }
}
