import { Module, Logger } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WalletModule } from './wallet/wallet.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BotModule } from './bot/bot.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger('MongoDB');
        const uri = configService.get<string>('MONGO_URI');

        logger.debug(`Connecting to MongoDB`);

        return {
          uri,
          connectionFactory: (connection) => {
            connection.on('connected', () => {
              logger.log('✅ MongoDB connected successfully.');
            });
            connection.on('error', (err) => {
              logger.error('❌ MongoDB connection error:', err);
            });
            return connection;
          },
        };
      },
    }),
    WalletModule,
    BotModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
