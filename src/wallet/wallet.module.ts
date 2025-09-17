import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
