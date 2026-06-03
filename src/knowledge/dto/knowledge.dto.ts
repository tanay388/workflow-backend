import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateKnowledgeBaseDto {
  @IsString()
  name: string;
}

export class SearchKnowledgeBaseDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  top_k?: number;
}
