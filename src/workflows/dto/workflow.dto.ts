import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { WorkflowGraph } from '../../common/types/graph';
import { WorkflowStatus } from '../entities/workflow.entity';

export class CreateWorkflowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @IsOptional()
  @IsObject()
  graph?: WorkflowGraph;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ListWorkflowsQueryDto {
  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;
}

export class ValidateGraphDto {
  @IsObject()
  graph: WorkflowGraph;
}
