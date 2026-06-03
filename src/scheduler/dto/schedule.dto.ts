import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import type { ScheduleRepeat, ScheduleStatus } from '../schedule.types';

export class CreateScheduleDto {
  @IsString()
  timezone!: string;

  @Matches(/^\d{1,2}:\d{2}$/)
  localTime!: string;

  @IsEnum(['none', 'daily', 'weekly', 'monthly', 'cron'])
  repeat!: ScheduleRepeat;

  @IsOptional()
  @IsString()
  cronExpr?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  daysOfWeek?: number[];

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  label?: string;
}

export class PatchScheduleDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @Matches(/^\d{1,2}:\d{2}$/)
  localTime?: string;

  @IsOptional()
  @IsEnum(['none', 'daily', 'weekly', 'monthly', 'cron'])
  repeat?: ScheduleRepeat;

  @IsOptional()
  @IsString()
  cronExpr?: string | null;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[] | null;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endsOn?: string | null;

  @IsOptional()
  @IsObject()
  input?: Record<string, unknown> | null;

  @IsOptional()
  @IsEnum(['active', 'paused', 'archived'])
  status?: ScheduleStatus;

  @IsOptional()
  @IsString()
  label?: string;
}
