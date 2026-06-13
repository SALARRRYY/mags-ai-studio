import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4000'),
    topP: parseFloat(process.env.OPENAI_TOP_P || '1.0'),
  },

  // Chat Configuration
  chat: {
    maxHistoryMessages: parseInt(process.env.CHAT_MAX_HISTORY || '50'),
    maxTokensPerMessage: parseInt(process.env.CHAT_MAX_TOKENS_PER_MESSAGE || '4000'),
    contextWindowSize: parseInt(process.env.CHAT_CONTEXT_WINDOW || '8000'),
    defaultSystemPrompt: process.env.CHAT_SYSTEM_PROMPT || 
      'You are a helpful AI assistant for MAGS AI Studio. Help users with coding, analysis, and creative tasks.',
  },

  // Streaming Configuration
  streaming: {
    chunkSize: parseInt(process.env.STREAMING_CHUNK_SIZE || '50'),
    timeoutMs: parseInt(process.env.STREAMING_TIMEOUT || '120000'),
  },

  // Rate Limiting
  rateLimit: {
    messagesPerMinute: parseInt(process.env.RATE_LIMIT_MESSAGES_PER_MINUTE || '60'),
    tokensPerDay: parseInt(process.env.RATE_LIMIT_TOKENS_PER_DAY || '1000000'),
  },

  // Provider Configuration
  provider: process.env.AI_PROVIDER || 'openai',
  enableMock: process.env.ENABLE_MOCK_AI === 'true',
}));
