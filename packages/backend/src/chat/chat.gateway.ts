import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, UseGuards, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { AIService } from '@/ai/ai.service';
import { RedisService } from '@/redis/redis.service';
import { PrismaService } from '@/prisma/prisma.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  sessionId?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
@Injectable()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private activeConnections = new Map<string, Set<string>>();

  constructor(
    private chatService: ChatService,
    private aiService: AIService,
    private redisService: RedisService,
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  /**
   * Handle client connection
   */
  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract token from handshake
      const token = client.handshake.auth.token;

      if (!token) {
        client.disconnect();
        return;
      }

      // Verify token (implement your JWT verification logic)
      const decoded = await this.verifyToken(token);

      if (!decoded) {
        client.disconnect();
        return;
      }

      client.userId = decoded.sub;
      client.sessionId = client.id;

      // Track connection
      if (!this.activeConnections.has(decoded.sub)) {
        this.activeConnections.set(decoded.sub, new Set());
      }
      this.activeConnections.get(decoded.sub)!.add(client.id);

      // Store session in Redis
      await this.redisService.setJSON(`ws:${client.id}`, {
        userId: decoded.sub,
        connectedAt: new Date(),
        ip: client.handshake.address,
      });

      this.logger.log(`User ${decoded.sub} connected via WebSocket`);
      client.emit('connected', { sessionId: client.id });
    } catch (error) {
      this.logger.error('Connection error:', error);
      client.disconnect();
    }
  }

  /**
   * Handle client disconnect
   */
  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const userConnections = this.activeConnections.get(client.userId);
      if (userConnections) {
        userConnections.delete(client.id);
        if (userConnections.size === 0) {
          this.activeConnections.delete(client.userId);
        }
      }

      await this.redisService.delete(`ws:${client.id}`);
      this.logger.log(`User ${client.userId} disconnected`);
    }
  }

  /**
   * Handle typing indicator
   */
  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { chatId: string; isTyping: boolean },
  ) {
    if (!client.userId) {
      throw new WsException('Unauthorized');
    }

    // Broadcast to other users in same chat
    this.server.emit('chat:typing:update', {
      chatId: data.chatId,
      userId: client.userId,
      isTyping: data.isTyping,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle incoming message and stream AI response
   */
  @SubscribeMessage('chat:send')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { chatId: string; content: string },
  ) {
    if (!client.userId) {
      throw new WsException('Unauthorized');
    }

    try {
      const { chatId, content } = data;

      // Validate and save user message
      const messageData = await this.chatService.sendMessage(
        chatId,
        client.userId,
        { content },
      );

      // Notify user message received
      client.emit('chat:message:created', {
        chatId,
        role: 'user',
        content,
        timestamp: Date.now(),
      });

      // Start AI streaming response
      await this.streamAIResponse(client, chatId, client.userId, messageData);
    } catch (error) {
      this.logger.error('Send message error:', error);
      client.emit('chat:error', {
        error: error.message || 'Failed to send message',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Stream AI response token-by-token
   */
  private async streamAIResponse(
    client: AuthenticatedSocket,
    chatId: string,
    userId: string,
    messageData: any,
  ) {
    try {
      // Create placeholder for AI message
      const aiMessageId = `msg_${Date.now()}`;

      client.emit('chat:stream:start', {
        messageId: aiMessageId,
        chatId,
        timestamp: Date.now(),
      });

      let fullContent = '';
      let tokenCount = 0;

      // Stream from AI
      const stream = await this.aiService.streamCompletion({
        messages: messageData.contextMessages,
        systemPrompt: messageData.chatConfig.systemPrompt,
        modelId: messageData.chatConfig.modelId,
        temperature: messageData.chatConfig.temperature,
        maxTokens: messageData.chatConfig.maxTokens,
        topP: messageData.chatConfig.topP,
      });

      // Process stream
      for await (const chunk of stream) {
        if (chunk.token) {
          fullContent += chunk.token;
          tokenCount += 1;

          // Emit token to client
          client.emit('chat:stream:chunk', {
            messageId: aiMessageId,
            token: chunk.token,
            fullContent,
            timestamp: Date.now(),
          });
        }
      }

      // Estimate total tokens
      const estimatedTokens = this.aiService.estimateTokens(fullContent);

      // Save AI response
      await this.chatService.saveAIResponse(
        chatId,
        userId,
        fullContent,
        estimatedTokens,
        messageData.chatConfig.modelId,
      );

      // Emit completion
      client.emit('chat:stream:complete', {
        messageId: aiMessageId,
        chatId,
        content: fullContent,
        tokens: estimatedTokens,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error('Stream error:', error);
      client.emit('chat:error', {
        error: error.message || 'Failed to get AI response',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle message edit
   */
  @SubscribeMessage('chat:edit')
  async handleEditMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: string; content: string },
  ) {
    if (!client.userId) {
      throw new WsException('Unauthorized');
    }

    try {
      // Update message in DB
      await this.prisma.chatMessage.update({
        where: { id: data.messageId },
        data: {
          content: data.content,
          isEdited: true,
          editedAt: new Date(),
        },
      });

      client.emit('chat:message:updated', {
        messageId: data.messageId,
        content: data.content,
        timestamp: Date.now(),
      });
    } catch (error) {
      client.emit('chat:error', {
        error: 'Failed to edit message',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Verify JWT token
   */
  private async verifyToken(token: string): Promise<any> {
    try {
      // Extract token from Bearer format if needed
      const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;

      // Implement your JWT verification
      // This is a placeholder - use your actual JWT verification logic
      const payload = await this.decodeJWT(cleanToken);
      return payload;
    } catch (error) {
      this.logger.error('Token verification failed:', error);
      return null;
    }
  }

  /**
   * Decode JWT (placeholder - implement with your library)
   */
  private async decodeJWT(token: string): Promise<any> {
    // This is a placeholder - implement actual JWT verification
    // For now, return decoded payload structure
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = Buffer.from(parts[1], 'base64').toString();
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
}
