import { Module } from '@nestjs/common';
import { AIService } from './ai.service';
import { OpenAIProvider } from './providers/openai.provider';
import { MockProvider } from './providers/mock.provider';

@Module({
  providers: [AIService, OpenAIProvider, MockProvider],
  exports: [AIService],
})
export class AIModule {}
