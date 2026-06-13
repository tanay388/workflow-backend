import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
