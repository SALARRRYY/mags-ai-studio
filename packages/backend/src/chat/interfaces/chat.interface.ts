export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
  createdAt: Date;
  isEdited?: boolean;
  editedAt?: Date;
}

export interface ChatContext {
  chatId: string;
  userId: string;
  messages: ChatMessage[];
  modelId: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  topP: number;
}
