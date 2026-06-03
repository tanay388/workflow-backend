import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { LlmProvider } from '../../common/llm/llm.types';

export class CreateModelDto {
  @IsEnum(LlmProvider)
  provider!: LlmProvider;

  @IsString()
  @IsNotEmpty()
  modelKey!: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @IsNumberString()
  inputPricePerMillionUsd!: string;

  @IsNumberString()
  outputPricePerMillionUsd!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateModelDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  displayName?: string;

  @IsOptional()
  @IsNumberString()
  inputPricePerMillionUsd?: string;

  @IsOptional()
  @IsNumberString()
  outputPricePerMillionUsd?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class StepUpConfirmDto {
  @IsString()
  @MinLength(1)
  password!: string;
}
