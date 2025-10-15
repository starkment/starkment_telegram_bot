import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Account, RpcProvider, PaymasterRpc, uint256, num } from 'starknet';

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

  async getUSDTBalance(address: string): Promise<string> {
    try {
      // Validate address
      if (!address || !address.startsWith('0x')) {
        throw new Error(`Invalid address: ${address}`);
      }

      const result = await this.provider.callContract({
        contractAddress: this.USDT_CONTRACT,
        entrypoint: 'balanceOf',
        calldata: [num.toHex(address)],
      });

      // Ensure the result contains two elements (low, high)
      if (!result || result.length < 2 || !result[0] || !result[1]) {
        throw new Error(`Invalid contract response: ${JSON.stringify(result)}`);
      }

      // ✅ Convert properly from uint256
      const balance = uint256.uint256ToBN({
        low: result[0],
        high: result[1],
      });

      const decimals = 6n;
      const formatted = Number(balance) / Number(10n ** decimals);
      this.logger.log(`USDT balance of ${address}: ${formatted} USDT`);

      return formatted.toString();
    } catch (err) {
      const errorMsg = `❌ getUSDTBalance error: ${err.message}`;
      this.logger.error(errorMsg);
      return '0'; // ✅ Return 0 balance instead of throwing
    }
  }

  async getUSDTHistory(address: string, limit = 10): Promise<any[]> {
    try {
      this.logger.log(`Fetching USDT transfer history for ${address}...`);

      // Query recent transactions for this address
      const txs = await this.provider.getBlockWithTxs('latest');

      // Filter transactions where this address is sender or receiver
      const history = txs.transactions
        .filter(
          (tx: any) =>
            tx.calldata?.includes(address) ||
            tx.contract_address?.toLowerCase() ===
              this.USDT_CONTRACT.toLowerCase(),
        )
        .slice(0, limit);

      this.logger.log(
        `Found ${history.length} recent USDT transactions for ${address}`,
      );

      return history.map((tx: any) => ({
        tx_hash: tx.transaction_hash,
        status: tx.status,
        type: tx.entry_point_selector === 'transfer' ? 'transfer' : 'unknown',
        timestamp: tx.timestamp,
        calldata: tx.calldata,
      }));
    } catch (err) {
      const errorMsg = `❌ getUSDTHistory error: ${err.message}`;
      this.logger.error(errorMsg);
      throw err;
    }
  }
}
