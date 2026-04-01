import { Controller, Post, Body, BadRequestException, Get } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) { }

  @Get('namespaces')
  async getNamespaces() {
    return this.chatService.getNamespaces();
  }

  @Post('ask')
  async askQuestion(
    @Body('question') question: string,
    @Body('limit') limit?: number,
    @Body('sessionId') sessionId?: string,
    @Body('namespace') namespace?: string,
  ) {
    if (!question) {
      throw new BadRequestException('Question is required in the request body.');
    }

    return this.chatService.askQuestion(question, limit || 5, sessionId, namespace);
  }
}
