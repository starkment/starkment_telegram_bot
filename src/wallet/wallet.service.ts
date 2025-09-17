import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
} from 'starknet';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private readonly configService: ConfigService) {}

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
}
