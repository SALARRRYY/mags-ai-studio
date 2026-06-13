import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtGuard } from '@/auth/guards/jwt.guard';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(JwtGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  /**
   * Create new chat
   */
  @Post('session')
  @HttpCode(HttpStatus.CREATED)
  async createChat(
    @CurrentUser() user: any,
    @Body() createChatDto: CreateChatDto,
  ) {
    return await this.chatService.createChat(user.sub, createChatDto);
  }

  /**
   * Get chat by ID
   */
  @Get('session/:id')
  async getChatById(
    @Param('id') chatId: string,
    @CurrentUser() user: any,
  ) {
    return await this.chatService.getChatById(chatId, user.sub);
  }

  /**
   * Get all user chats (for sidebar)
   */
  @Get('sessions')
  async getUserChats(@CurrentUser() user: any) {
    return await this.chatService.getUserChats(user.sub);
  }

  /**
   * Get chat history (messages)
   */
  @Get('history/:sessionId')
  async getChatHistory(
    @Param('sessionId') sessionId: string,
    @Query('skip') skip: string = '0',
    @Query('take') take: string = '50',
    @CurrentUser() user: any,
  ) {
    return await this.chatService.getChatHistory(
      sessionId,
      user.sub,
      parseInt(skip),
      parseInt(take),
    );
  }

  /**
   * Delete chat
   */
  @Delete('session/:id')
  async deleteChat(
    @Param('id') chatId: string,
    @CurrentUser() user: any,
  ) {
    return await this.chatService.deleteChat(chatId, user.sub);
  }

  /**
   * Update chat title
   */
  @Patch('session/:id/title')
  async updateChatTitle(
    @Param('id') chatId: string,
    @Body('title') title: string,
    @CurrentUser() user: any,
  ) {
    return await this.chatService.updateChatTitle(chatId, user.sub, title);
  }

  /**
   * Toggle pin chat
   */
  @Post('session/:id/pin')
  async togglePin(
    @Param('id') chatId: string,
    @CurrentUser() user: any,
  ) {
    return await this.chatService.togglePinChat(chatId, user.sub);
  }

  /**
   * Clear chat history
   */
  @Post('session/:id/clear')
  async clearHistory(
    @Param('id') chatId: string,
    @CurrentUser() user: any,
  ) {
    return await this.chatService.clearChatHistory(chatId, user.sub);
  }
}
