import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AlertThresholdDto {
  @IsInt()
  @Min(1)
  @Max(100)
  pct!: number;

  @IsOptional()
  @IsString()
  channel?: string;
}

export class UpdateOrgLimitsDto {
  @IsOptional()
  @IsString()
  dailyTokenCap?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AlertThresholdDto)
  alertThresholds?: AlertThresholdDto[] | null;
}

export class UsageTimeseriesQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class ByWorkflowQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
