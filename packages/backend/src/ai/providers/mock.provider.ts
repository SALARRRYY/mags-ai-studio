import { Injectable, Logger } from '@nestjs/common';
import { AIProvider, CompletionOptions, AIResponse, AIStreamToken } from './ai-provider.interface';

@Injectable()
export class MockProvider implements AIProvider {
  private readonly logger = new Logger(MockProvider.name);

  async complete(options: CompletionOptions): Promise<AIResponse> {
    const responses = [
      'This is a mock AI response. In production, this would be powered by OpenAI or another provider.',
      'Great question! Here\'s what I think: The mock provider is useful for testing the chat system without using real API tokens.',
      'I understand your concern. The streaming feature allows for real-time token delivery to the frontend.',
    ];

    const response =
      responses[Math.floor(Math.random() * responses.length)];
    const tokens = this.estimateTokens(response);

    return {
      content: response,
      tokens,
      model: 'mock-model',
      finishReason: 'stop',
    };
  }

  async *streamCompletion(
    options: CompletionOptions,
  ): AsyncIterable<AIStreamToken> {
    const responses = [
      'This is a mock AI response. ',
      'In production, this would be powered by OpenAI or another provider. ',
      'The streaming feature allows for real-time token delivery to the frontend. ',
      'Each token is sent individually to create a ChatGPT-like experience.',
    ];

    for (const response of responses) {
      for (const char of response) {
        await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate streaming delay

        yield {
          token: char,
          timestamp: Date.now(),
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async getAvailableModels(): Promise<string[]> {
    return ['mock-model'];
  }
}
