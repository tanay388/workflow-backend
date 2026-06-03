import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertLlmCredentialDto {
  @IsString()
  @MinLength(8)
  key: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  base_url?: string;
}
