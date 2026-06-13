import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider } from './providers/ai-provider.interface';
import { OpenAIProvider } from './providers/openai.provider';
import { MockProvider } from './providers/mock.provider';
import { CompletionOptions, AIResponse, AIStreamToken } from './providers/ai-provider.interface';

@Injectable()
export class AIService {
  private provider: AIProvider;

  constructor(
    private configService: ConfigService,
    private openaiProvider: OpenAIProvider,
    private mockProvider: MockProvider,
  ) {
    this.initializeProvider();
  }

  /**
   * Initialize AI provider based on config
   */
  private initializeProvider() {
    const enableMock = this.configService.get('ai.enableMock');
    const providerName = this.configService.get('ai.provider');

    if (enableMock) {
      this.provider = this.mockProvider;
    } else {
      switch (providerName) {
        case 'openai':
        default:
          this.provider = this.openaiProvider;
      }
    }
  }

  /**
   * Get non-streaming completion
   */
  async complete(options: CompletionOptions): Promise<AIResponse> {
    return this.provider.complete(options);
  }

  /**
   * Stream completion response
   */
  async streamCompletion(options: CompletionOptions): AsyncIterable<AIStreamToken> {
    return this.provider.streamCompletion(options);
  }

  /**
   * Estimate tokens in text
   */
  estimateTokens(text: string): number {
    return this.provider.estimateTokens(text);
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<string[]> {
    return this.provider.getAvailableModels();
  }
}
