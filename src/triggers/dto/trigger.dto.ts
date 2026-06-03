import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateComposioTriggerDto {
  @IsUUID()
  connected_account_id!: string;

  @IsString()
  @MaxLength(128)
  toolkit!: string;

  @IsString()
  @MaxLength(256)
  event_slug!: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  user_query?: string;
}

export class CreateWorkflowTriggerLinkDto {
  @IsUUID()
  source_workflow_id!: string;

  @IsUUID()
  target_workflow_id!: string;

  @IsEnum(['completed', 'failed'])
  event!: 'completed' | 'failed';
}

export class InternalWebhookDto {
  @IsString()
  idempotency_key!: string;

  @IsUUID()
  workflow_id!: string;

  @IsUUID()
  org_id!: string;

  @IsUUID()
  workspace_id!: string;

  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  bound_run_id?: string;
}

export class MintInboundWebhookDto {
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}
