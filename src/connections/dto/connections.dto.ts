import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateConnectionDto {
  @IsString()
  @MinLength(1)
  toolkit!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}

export class PatchConnectionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class InitiateConnectionDto extends CreateConnectionDto {
  @IsOptional()
  @IsString()
  callback_url?: string;
}
