import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';

export class CreateChatDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  modelId?: string; // Default: gpt-4

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;
}
