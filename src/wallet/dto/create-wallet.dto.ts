export class CreateWalletDto {
  userId: string; // Telegram user id
  transactionHash: string;
  walletAddress: string;
  publicKey: string;
  privateKey: string;
  status: string;
  gasToken: string;
  mode: string;
  success: boolean;
}
