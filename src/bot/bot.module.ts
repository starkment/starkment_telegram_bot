import { Module } from '@nestjs/common';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';
import { MessageService } from './message/message.service';
import { UpdateService } from './update/update.service';

@Module({
  controllers: [BotController],
  providers: [BotService, MessageService, UpdateService]
})
export class BotModule {}
