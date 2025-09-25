import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Wallet extends Document {
  @Prop({ required: true })
  userId: string; // Telegram ID

  @Prop()
  transactionHash: string;

  @Prop()
  walletAddress: string;

  @Prop()
  publicKey: string;

  @Prop()
  privateKey: string;

  @Prop()
  status: string;

  @Prop()
  gasToken: string;

  @Prop()
  mode: string;

  @Prop()
  success: boolean;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
