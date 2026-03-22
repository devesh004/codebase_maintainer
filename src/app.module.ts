import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IngestionModule } from './ingestion/ingestion.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [IngestionModule, ChatModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
