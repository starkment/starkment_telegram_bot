export class CreateWalletDto {
  userId: string;
  username?: string;
  email?: string;
  transactionHash: string;
  walletAddress: string;
  publicKey: string;
  privateKey: string;
  status: string;
  gasToken: string;
  mode: string;
  success: boolean;
  iv: any;
  authTag: any;
  transactionPin: string;
}
