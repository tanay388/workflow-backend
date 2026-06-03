import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32_000)
  content!: string;
}

export class AnswerPromptDto {
  @IsUUID()
  runId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8_000)
  answer!: string;
}

export class ChatRunControlDto {
  @IsString()
  type!: 'pause' | 'cancel' | 'answer-prompt';

  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  answer?: string;
}
