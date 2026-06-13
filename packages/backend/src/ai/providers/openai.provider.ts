import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider, CompletionOptions, AIResponse, AIStreamToken } from './ai-provider.interface';
import fetch from 'node-fetch';

@Injectable()
export class OpenAIProvider implements AIProvider {
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get('ai.openai.apiKey');
    this.baseUrl = this.configService.get('ai.openai.baseUrl');
    this.defaultModel = this.configService.get('ai.openai.model');

    if (!this.apiKey) {
      this.logger.warn('OpenAI API key not configured');
    }
  }

  /**
   * Get non-streaming completion (fallback)
   */
  async complete(options: CompletionOptions): Promise<AIResponse> {
    try {
      const messages = this.buildMessages(options);
      const model = options.modelId || this.defaultModel;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 4000,
          top_p: options.topP ?? 1.0,
          stream: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }

      const data = (await response.json()) as any;

      return {
        content: data.choices[0].message.content,
        tokens: data.usage?.total_tokens || 0,
        model: data.model,
        finishReason: data.choices[0].finish_reason,
      };
    } catch (error) {
      this.logger.error('Completion error:', error);
      throw error;
    }
  }

  /**
   * Stream completion token-by-token
   */
  async *streamCompletion(options: CompletionOptions): AsyncIterable<AIStreamToken> {
    try {
      const messages = this.buildMessages(options);
      const model = options.modelId || this.defaultModel;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 4000,
          top_p: options.topP ?? 1.0,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }

      // @ts-ignore - node-fetch returns Readable stream
      const reader = response.body;

      for await (const chunk of reader) {
        const text = chunk.toString();
        const lines = text.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices[0]?.delta?.content;

              if (token) {
                yield {
                  token,
                  timestamp: Date.now(),
                };
              }
            } catch (e) {
              // Skip malformed lines
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Stream error:', error);
      throw error;
    }
  }

  /**
   * Estimate tokens using simple heuristic
   */
  estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<string[]> {
    return ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  }

  /**
   * Build message array with system prompt
   */
  private buildMessages(options: CompletionOptions): any[] {
    const messages = [];

    if (options.systemPrompt) {
      messages.push({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    messages.push(...options.messages);

    return messages;
  }
}
