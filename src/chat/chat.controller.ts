import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) { }

  @Post('ask')
  async askQuestion(
    @Body('question') question: string,
    @Body('limit') limit?: number,
    @Body('sessionId') sessionId?: string,
  ) {
    if (!question) {
      throw new BadRequestException('Question is required in the request body.');
    }

    return this.chatService.askQuestion(question, limit || 5, sessionId);
  }
}
