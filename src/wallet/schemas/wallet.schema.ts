import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Wallet extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop()
  username: string; // telegram username

  @Prop()
  email: string; //  user-provided email

  @Prop({ required: true })
  walletAddress: string;

  @Prop({ required: true })
  publicKey: string;

  @Prop({ required: true })
  privateKey: string;

  @Prop({ required: true })
  iv: string;

  @Prop({ required: true })
  authTag: string;

  @Prop({ required: true })
  status: string;

  @Prop()
  gasToken: string;

  @Prop()
  mode: string;

  @Prop({ default: true })
  success: boolean;

  @Prop({ required: true })
  transactionPin: string;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
