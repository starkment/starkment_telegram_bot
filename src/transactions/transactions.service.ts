import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Account, RpcProvider, PaymasterRpc, uint256 } from 'starknet';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);
  private provider = new RpcProvider({
    nodeUrl: 'https://starknet-sepolia.public.blastapi.io',
  });
  private account: Account;
  public USDT_CONTRACT =
    '0x0773Ec0C0Bb16014f733888610c5c19123B6d5e3615Ea26208e7c90b0b5cddb2'; // deployed USDT address on Starknet

  constructor(private readonly configService: ConfigService) {
    const accountAddressPool = this.configService.get<string>(
      'ACCOUNT_ADDRESS_POOL',
    );
    const privateKeyPool = this.configService.get<string>('PRIVATE_KEY_POOL');

    this.account = new Account({
      provider: this.provider,
      address: accountAddressPool,
      signer: privateKeyPool,
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

      // const msg = `✅ Gasless USDT transfer successful\nTx hash: ${result.transaction_hash}`;
      // this.logger.log(msg);
      // if (ctx) await ctx.reply(msg);

      return result;
    } catch (err) {
      const errorMsg = `❌ receiveUSDT error: ${err.message}`;
      this.logger.error(errorMsg);
      if (ctx) await ctx.reply(errorMsg);
      throw err;
    }
  }

  async sendUSDT(
    from: string,
    signer: string,
    to: string,
    amount: bigint,
    ctx?: any,
  ) {
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
        address: from,
        signer: signer,
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

      // const msg = `✅ Gasless USDT transfer successful\nTx hash: ${result.transaction_hash}`;
      // this.logger.log(msg);
      // if (ctx) await ctx.reply(msg);

      return result;
    } catch (err) {
      const errorMsg = `❌ sendUSDT error: ${err.message}`;
      this.logger.error(errorMsg);
      if (ctx) await ctx.reply(errorMsg);
      throw err;
    }
  }
}
