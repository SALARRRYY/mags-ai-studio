import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { AIService } from '@/ai/ai.service';
import { RedisService } from '@/redis/redis.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AIService,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {}

  /**
   * Create a new chat session
   */
  async createChat(userId: string, createChatDto: CreateChatDto) {
    const { title, modelId, systemPrompt, temperature, maxTokens, topP } =
      createChatDto;

    // Validate model exists
    const model = await this.prisma.aIModelConfig.findUnique({
      where: { name: modelId || 'gpt-4' },
    });

    if (!model) {
      throw new NotFoundException('AI model not found');
    }

    // Create chat
    const chat = await this.prisma.chat.create({
      data: {
        userId,
        title: title || 'New Chat',
        modelId: modelId || 'gpt-4',
        systemPrompt: systemPrompt || this.configService.get('ai.chat.defaultSystemPrompt'),
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 4000,
        topP: topP ?? 1.0,
      },
    });

    // Cache chat metadata
    await this.redisService.setJSON(`chat:${chat.id}`, {
      id: chat.id,
      userId,
      modelId: chat.modelId,
      messageCount: 0,
      lastMessageAt: null,
    });

    return {
      id: chat.id,
      title: chat.title,
      modelId: chat.modelId,
      createdAt: chat.createdAt,
    };
  }

  /**
   * Get chat by ID
   */
  async getChatById(chatId: string, userId: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            tokens: true,
            createdAt: true,
            isEdited: true,
          },
        },
      },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    // Verify ownership
    if (chat.userId !== userId) {
      throw new BadRequestException('Unauthorized access to chat');
    }

    return chat;
  }

  /**
   * Get chat history (paginated)
   */
  async getChatHistory(
    chatId: string,
    userId: string,
    skip: number = 0,
    take: number = 50,
  ) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (chat.userId !== userId) {
      throw new BadRequestException('Unauthorized access to chat');
    }

    const [messages, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { chatId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          role: true,
          content: true,
          tokens: true,
          createdAt: true,
          isEdited: true,
          editedAt: true,
        },
      }),
      this.prisma.chatMessage.count({ where: { chatId } }),
    ]);

    return {
      messages: messages.reverse(),
      total,
      skip,
      take,
    };
  }

  /**
   * Get all chats for user (for sidebar)
   */
  async getUserChats(userId: string, limit: number = 20) {
    const chats = await this.prisma.chat.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        id: true,
        title: true,
        messageCount: true,
        lastMessageAt: true,
        createdAt: true,
        isPinned: true,
        isFavorite: true,
      },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    return chats;
  }

  /**
   * Send message and get AI response (streaming)
   */
  async sendMessage(
    chatId: string,
    userId: string,
    sendMessageDto: SendMessageDto,
  ) {
    const { content } = sendMessageDto;

    // Validate chat
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (chat.userId !== userId) {
      throw new BadRequestException('Unauthorized access to chat');
    }

    // Save user message
    const userMessage = await this.prisma.chatMessage.create({
      data: {
        chatId,
        userId,
        role: 'user',
        content,
        tokens: this.aiService.estimateTokens(content),
      },
    });

    // Get conversation context
    const messages = await this.prisma.chatMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      take: this.configService.get('ai.chat.maxHistoryMessages'),
      select: {
        role: true,
        content: true,
      },
    });

    // Build context
    const contextMessages = [
      ...messages.slice(-this.configService.get('ai.chat.maxHistoryMessages')),
      { role: 'user', content },
    ];

    return {
      userMessageId: userMessage.id,
      contextMessages,
      chatConfig: {
        modelId: chat.modelId,
        systemPrompt: chat.systemPrompt,
        temperature: chat.temperature,
        maxTokens: chat.maxTokens,
        topP: chat.topP,
      },
    };
  }

  /**
   * Save AI response message
   */
  async saveAIResponse(
    chatId: string,
    userId: string,
    content: string,
    tokens: number,
    modelUsed: string,
  ) {
    // Create AI message
    const aiMessage = await this.prisma.chatMessage.create({
      data: {
        chatId,
        userId, // Store AI response with user's ID for context
        role: 'assistant',
        content,
        tokens,
        modelUsed,
      },
    });

    // Update chat metadata
    await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        messageCount: { increment: 2 }, // User + AI
        tokenUsage: { increment: tokens },
        lastMessageAt: new Date(),
      },
    });

    // Update cache
    const cached = await this.redisService.getJSON(`chat:${chatId}`);
    if (cached) {
      await this.redisService.setJSON(`chat:${chatId}`, {
        ...cached,
        messageCount: (cached.messageCount || 0) + 2,
        lastMessageAt: new Date(),
      });
    }

    return aiMessage;
  }

  /**
   * Delete chat
   */
  async deleteChat(chatId: string, userId: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (chat.userId !== userId) {
      throw new BadRequestException('Unauthorized access to chat');
    }

    // Soft delete
    await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        isActive: false,
        archivedAt: new Date(),
      },
    });

    // Clear cache
    await this.redisService.delete(`chat:${chatId}`);

    return { message: 'Chat deleted successfully' };
  }

  /**
   * Update chat title
   */
  async updateChatTitle(chatId: string, userId: string, title: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (chat.userId !== userId) {
      throw new BadRequestException('Unauthorized access to chat');
    }

    const updated = await this.prisma.chat.update({
      where: { id: chatId },
      data: { title },
    });

    return { id: updated.id, title: updated.title };
  }

  /**
   * Pin/Unpin chat
   */
  async togglePinChat(chatId: string, userId: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (chat.userId !== userId) {
      throw new BadRequestException('Unauthorized access to chat');
    }

    const updated = await this.prisma.chat.update({
      where: { id: chatId },
      data: { isPinned: !chat.isPinned },
    });

    return { id: updated.id, isPinned: updated.isPinned };
  }

  /**
   * Clear chat history (delete all messages)
   */
  async clearChatHistory(chatId: string, userId: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (chat.userId !== userId) {
      throw new BadRequestException('Unauthorized access to chat');
    }

    await this.prisma.chatMessage.deleteMany({
      where: { chatId },
    });

    await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        messageCount: 0,
        tokenUsage: 0,
      },
    });

    return { message: 'Chat history cleared' };
  }
}
