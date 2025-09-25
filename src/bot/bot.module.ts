import { Module } from '@nestjs/common';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';
import { MessageService } from './message/message.service';
import { UpdateService } from './update/update.service';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { TelegrafModule } from 'nestjs-telegraf';
import * as LocalSession from 'telegraf-session-local';
import { WalletModule } from 'src/wallet/wallet.module';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    HttpModule,
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        token: configService.get<string>('TELEGRAM_BOT_TOKEN'),
        middlewares: [
          new LocalSession({ database: 'session.json' }).middleware(),
        ],
      }),
    }),
    WalletModule,
  ],
  controllers: [BotController],
  providers: [BotService, MessageService, UpdateService],
})
export class BotModule {}
