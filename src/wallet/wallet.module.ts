import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from './schemas/wallet.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeatureAsync([
      {
        name: Wallet.name,
        useFactory: (configService: ConfigService) => {
          const collectionName = configService.get<string>(
            'USERS_WALLET_DETAILS_COLLECTION',
          );
          const schema = WalletSchema;
          schema.set('collection', collectionName);
          return schema;
        },
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
