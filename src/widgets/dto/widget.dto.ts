import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import type { WidgetBranding } from '../entities/chat-widget.entity';

export class UpdateWidgetDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedDomains?: string[];

  @IsOptional()
  @IsBoolean()
  allowCorsOrigins?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAllOrigins?: boolean;

  @IsOptional()
  @IsObject()
  branding?: WidgetBranding;

  @IsOptional()
  @IsBoolean()
  collectContact?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  rateLimitPerDay?: number;

  @IsOptional()
  @IsBoolean()
  recaptchaEnabled?: boolean;
}

export class VisitorPageContextDto {
  @IsOptional()
  @IsString()
  pageHost?: string;

  @IsOptional()
  @IsString()
  pageOrigin?: string;

  @IsOptional()
  @IsString()
  referrer?: string;
}

export class MintVisitorDto {
  @IsOptional()
  @IsString()
  visitorToken?: string;

  @IsOptional()
  @IsString()
  recaptchaToken?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  pageContext?: VisitorPageContextDto;
}

export class SubmitFormDto {
  @IsString()
  visitorToken!: string;

  @IsOptional()
  @IsString()
  recaptchaToken?: string;

  @IsObject()
  data!: Record<string, unknown>;

  @IsOptional()
  pageContext?: VisitorPageContextDto;
}

export class WidgetConversationDto {
  @IsString()
  visitorToken!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  /** Close any open widget chat and start a fresh conversation. */
  @IsOptional()
  @IsBoolean()
  newSession?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  message?: string;
}

export class WidgetMessageDto {
  @IsString()
  visitorToken!: string;

  @IsString()
  @MinLength(1)
  content!: string;
}
