import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import {
  Account,
  ec,
  stark,
  RpcProvider,
  hash,
  CallData,
  CairoOption,
  CairoOptionVariant,
  CairoCustomEnum,
  PaymasterRpc,
  num,
  uint256,
} from 'starknet';
import { Wallet } from './schemas/wallet.schema';
import { Model } from 'mongoose';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { encrypt } from 'src/common/crypto.util';
import * as bcrypt from 'bcrypt';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private provider = new RpcProvider({
    nodeUrl: 'https://starknet-sepolia.public.blastapi.io',
  });
  private account: Account;
  public USDT_CONTRACT =
    '0x0773Ec0C0Bb16014f733888610c5c19123B6d5e3615Ea26208e7c90b0b5cddb2'; // deployed USDT address on Starknet

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Wallet.name)
    private walletModel: Model<Wallet>,
  ) {
    const masterAccountAddressPool = this.configService.get<string>(
      'MASTER_PRIVATE_KEY_POOL',
    );
    const masterPrivateKeyPool = this.configService.get<string>('PRIVATE_KEY');

    this.account = new Account({
      provider: this.provider,
      address: masterAccountAddressPool,
      signer: masterPrivateKeyPool,
      cairoVersion: '1',
    });
  }

  async receiveUSDT(to: string, amount: bigint, ctx?: any) {
    try {
      const decimals = 6n;
      const value = amount * 10n ** decimals;

      if (!to.startsWith('0x')) {
        throw new Error(`Invalid recipient address: ${to}`);
      }

      const uint256Amount = uint256.bnToUint256(value);
      const transferCall = {
        contractAddress: this.USDT_CONTRACT,
        entrypoint: 'transfer',
        calldata: [to, uint256Amount.low, uint256Amount.high],
      };

      this.logger.log(
        `Preparing USDT transfer to ${to} with value ${value.toString()}`,
      );

      // Setup Paymaster
      const paymasterOptions: any = {
        nodeUrl:
          this.configService.get<string>('PAYMASTER_URL') ||
          'https://sepolia.paymaster.avnu.fi',
      };

      const apiKey = this.configService.get<string>('PAYMASTER_API_KEY');
      if (apiKey) {
        paymasterOptions.headers = {
          'x-paymaster-api-key': apiKey,
        };
      }

      const paymasterRpc = new PaymasterRpc(paymasterOptions);

      // Check paymaster availability
      const isAvailable = await paymasterRpc.isAvailable();
      if (!isAvailable) throw new Error('Paymaster service is not available');

      // Get supported gas tokens
      const supportedTokens = await paymasterRpc.getSupportedTokens();
      if (!supportedTokens || supportedTokens.length === 0)
        throw new Error('No supported gas tokens found');

      const gasToken =
        this.configService.get<string>('GAS_TOKEN_ADDRESS') ||
        supportedTokens[0]?.token_address;

      if (!gasToken) {
        throw new Error('No supported gas token available');
      }

      // Recreate account with paymaster enabled
      const account = new Account({
        provider: this.provider,
        address: this.account.address,
        signer: this.account.signer,
        cairoVersion: '1',
        paymaster: paymasterRpc,
      });

      // Set up paymaster fee mode
      const isSponsored =
        this.configService.get<string>('PAYMASTER_MODE') === 'sponsored';

      const feesDetails = {
        feeMode: isSponsored
          ? { mode: 'sponsored' }
          : { mode: 'default', gasToken: gasToken },
      };

      //  Estimate fee if not sponsored
      let maxFee: any = undefined;
      if (!isSponsored) {
        const feeEstimation = await account.estimatePaymasterTransactionFee(
          [transferCall],
          feesDetails as any,
        );
        maxFee = feeEstimation.suggested_max_fee_in_gas_token;
      }

      // Execute transaction with paymaster
      this.logger.log('Executing paymaster USDT transfer...');
      const result = await account.executePaymasterTransaction(
        [transferCall],
        feesDetails as any,
        maxFee,
      );

      const msg = `✅ Gasless USDT transfer successful\nTx hash: ${result.transaction_hash}`;
      this.logger.log(msg);
      if (ctx) await ctx.reply(msg);

      return result;
    } catch (err) {
      const errorMsg = `❌ sendUSDT error: ${err.message}`;
      this.logger.error(errorMsg);
      if (ctx) await ctx.reply(errorMsg);
      throw err;
    }
  }

  // wallet creation with Starknet.js v8.5.2 paymaster
  async createWallet() {
    const provider = new RpcProvider({
      nodeUrl: this.configService.get<string>('RPC_URL'),
    });

    const paymasterOptions: any = {
      nodeUrl:
        this.configService.get<string>('PAYMASTER_URL') ||
        'https://sepolia.paymaster.avnu.fi',
    };

    const apiKey = this.configService.get<string>('PAYMASTER_API_KEY');
    if (apiKey) {
      paymasterOptions.headers = {
        'x-paymaster-api-key': apiKey,
      };
    }

    const paymasterRpc = new PaymasterRpc(paymasterOptions);

    // check if Paymaster service is available
    const isAvailable = await paymasterRpc.isAvailable();
    if (!isAvailable) {
      throw new Error('Paymaster service is not available');
    }

    // Supported gas tokens
    const supportedTokens = await paymasterRpc.getSupportedTokens();

    const gasToken =
      this.configService.get<string>('GAS_TOKEN_ADDRESS') ||
      supportedTokens[0]?.token_address;
    if (!gasToken) {
      throw new Error('No supported gas tokens available');
    }

    // generate keys
    const privateKey = stark.randomAddress();
    const publicKey = ec.starkCurve.getStarkKey(privateKey);

    const accountClassHash = this.configService.get<string>('READY_CLASSHASH');

    const signer = new CairoCustomEnum({ Starknet: { pubkey: publicKey } });
    const guardian = new CairoOption(CairoOptionVariant.None);

    const constructorCalldata = CallData.compile({
      owner: signer,
      guardian: guardian,
    }).map((value) => num.toHex(value));

    const contractAddress = hash.calculateContractAddressFromHash(
      publicKey,
      accountClassHash,
      constructorCalldata,
      0,
    );

    const account = new Account({
      provider,
      address: contractAddress,
      signer: privateKey,
      cairoVersion: '1',
      paymaster: paymasterRpc,
    });

    try {
      const isSponsored =
        this.configService.get<string>('PAYMASTER_MODE') === 'sponsored';

      const deploymentData = {
        class_hash: accountClassHash,
        salt: publicKey,
        calldata: constructorCalldata,
        address: contractAddress,
        version: 1,
      };

      const initialCall = {
        contractAddress: this.configService.get<string>('CONTRACT_ADDRESS'),
        entrypoint:
          this.configService.get<string>('CONTRACT_ENTRY_POINT_GET_COUNTER') ||
          'get_counter',
        calldata: CallData.compile([contractAddress]),
      };

      const paymasterDetails = {
        feeMode: isSponsored
          ? { mode: 'sponsored' }
          : { mode: 'default', gasToken: gasToken },
        deploymentData,
      };

      let maxFee: any = undefined;

      if (!isSponsored) {
        const feeEstimation = await account.estimatePaymasterTransactionFee(
          [initialCall],
          paymasterDetails as any,
        );

        maxFee = feeEstimation.suggested_max_fee_in_gas_token;
      }

      this.logger.log('Executing paymaster transaction...');
      const result = await account.executePaymasterTransaction(
        [initialCall],
        paymasterDetails as any,
        maxFee,
      );

      this.logger.log(`Transaction hash: ${result.transaction_hash}`);
      this.logger.log(
        'Transaction submitted successfully - not waiting for confirmation',
      );

      return {
        success: true,
        transactionHash: result.transaction_hash,
        walletAddress: contractAddress,
        publicKey,
        privateKey,
        status: 'SUBMITTED',
        gasToken: !isSponsored ? gasToken : 'sponsored',
        mode: isSponsored ? 'sponsored' : 'default',
      };
    } catch (error) {
      this.logger.error('Error in wallet creation:', error.stack || error);
      return {
        success: false,
        error: error.message,
        details: error.stack || 'Failed to create wallet with paymaster',
      };
    }
  }

  async saveUserWalletDetails(
    userId: string,
    pin: string,
    username?: string,
    email?: string,
  ): Promise<string> {
    const existing = await this.walletModel.findOne({ userId }).exec();
    if (existing) {
      return `⚠️ Account already registered`;
    }

    const walletData = await this.createWallet();
    if (!walletData.success) {
      this.logger.error(
        `Wallet creation failed for user ${userId}: ${walletData.error}`,
      );
      return `❌ Wallet creation failed. Reason: ${walletData.error || 'Unknown error'}`;
    }

    const hashedPin = await bcrypt.hash(pin, 10);
    const encrypted = encrypt(walletData.privateKey);

    const createWalletDto: CreateWalletDto = {
      userId,
      username, // Telegram username
      email, // save email
      transactionHash: walletData.transactionHash,
      walletAddress: walletData.walletAddress,
      publicKey: walletData.publicKey,
      privateKey: encrypted.encryptedData,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      status: walletData.status,
      gasToken: walletData.gasToken,
      mode: walletData.mode,
      success: true,
      transactionPin: hashedPin,
    };

    const newWallet = new this.walletModel(createWalletDto);
    await newWallet.save();

    return `✅ Account and transaction PIN set successfully. Please provide your email to complete registration.`;
  }

  async findByUserId(userId: string) {
    return this.walletModel.findOne({ userId }).exec();
  }

  async updateEmail(userId: string, email: string): Promise<void> {
    await this.walletModel.updateOne({ userId }, { $set: { email } }).exec();
  }
}
