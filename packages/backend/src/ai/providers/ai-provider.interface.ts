export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  messages: AIMessage[];
  systemPrompt?: string;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface AIResponse {
  content: string;
  tokens: number;
  model: string;
  finishReason: string;
}

export interface AIStreamToken {
  token: string;
  timestamp: number;
}

export interface AIProvider {
  complete(options: CompletionOptions): Promise<AIResponse>;
  streamCompletion(options: CompletionOptions): AsyncIterable<AIStreamToken>;
  estimateTokens(text: string): number;
  getAvailableModels(): Promise<string[]>;
}
