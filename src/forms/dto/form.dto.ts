import { IsArray, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateFormDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  schema!: unknown[];
}

export class UpdateFormDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsArray()
  schema?: unknown[];

  @IsOptional()
  @IsUUID()
  boundWidgetId?: string | null;
}

export class PublishFormDto {
  @IsOptional()
  @IsUUID()
  boundWidgetId?: string | null;
}
