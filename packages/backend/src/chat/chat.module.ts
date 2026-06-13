import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { PrismaModule } from '@/prisma/prisma.module';
import { AIModule } from '@/ai/ai.module';
import { RedisModule } from '@/redis/redis.module';

@Module({
  imports: [PrismaModule, AIModule, RedisModule],
  providers: [ChatService, ChatGateway],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
