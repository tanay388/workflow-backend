import { IsIn, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListRunsQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  workflowId?: string;

  @IsOptional()
  @IsIn(['queued', 'running', 'paused', 'completed', 'failed', 'canceled'])
  status?: string;

  @IsOptional()
  triggerSource?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  runByType?: string;

  @IsOptional()
  @IsString()
  runById?: string;
}

export class EnqueueRunBodyDto {
  @IsOptional()
  input?: unknown;
}
