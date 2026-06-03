import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PlatformAdminRole } from '../entities/platform-admin.entity';

export class PlatformLoginDto {
  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class AdminOrgSearchDto {
  @IsOptional()
  @IsString()
  search?: string;
}

export class AssignOrgPlanDto {
  @IsOptional()
  @IsUUID()
  planId?: string | null;

  @IsOptional()
  @IsNumberString()
  monthlyTokenQuota?: string | null;

  @IsOptional()
  @IsNumberString()
  pricePerMillionUsd?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  concurrencyLimit?: number;
}

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumberString()
  baseMonthlyQuota!: string;

  @IsNumberString()
  defaultPricePerMillionUsd!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultConcurrency?: number;

  @IsOptional()
  @IsNumberString()
  includedMonthlyCreditUsd?: string | null;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsNumberString()
  baseMonthlyQuota?: string;

  @IsOptional()
  @IsNumberString()
  defaultPricePerMillionUsd?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultConcurrency?: number;

  @IsOptional()
  @IsNumberString()
  includedMonthlyCreditUsd?: string | null;
}

export class AdminAuditQueryDto {
  @IsOptional()
  @IsString()
  actorType?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsUUID()
  orgId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreatePlatformAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(PlatformAdminRole)
  role!: PlatformAdminRole;
}

export class UpdatePlatformAdminDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(PlatformAdminRole)
  role?: PlatformAdminRole;
}

export class OrgCreditActionDto {
  @IsNumber()
  amountUsd!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
