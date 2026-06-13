export class ChatResponseDto {
  id: string;
  title: string;
  modelId: string;
  messageCount: number;
  tokenUsage: number;
  createdAt: Date;
  lastMessageAt?: Date;
}
