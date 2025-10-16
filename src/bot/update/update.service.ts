import { Start, Ctx, Action, Update, On } from 'nestjs-telegraf';
import { TransactionsService } from 'src/transactions/transactions.service';
import { WalletService } from 'src/wallet/wallet.service';
import { Context } from 'telegraf';
import {
  Message,
  Update as TgUpdate,
} from 'telegraf/typings/core/types/typegram';
import * as bcrypt from 'bcrypt';
import { decrypt } from 'src/common/crypto.util';

interface BotContext extends Context {
  session?: {
    awaitingPin?: boolean;
    awaitingEmail?: boolean;
    awaitingAmount?: boolean;
    awaitingRecipient?: boolean;
    telegramId?: string;
    walletAddress?: string;
    recipientAddress?: string;
    action?: 'register' | 'receive_usd' | 'send_usd';
  };
}

@Update()
export class UpdateService {
  constructor(
    private readonly walletService: WalletService,
    private readonly transactionsService: TransactionsService,
  ) {}

  @Start()
  async start(@Ctx() ctx: BotContext) {
    await ctx.reply('Welcome to Starkment Bot!\n\n', {
      reply_markup: {
        inline_keyboard: [[{ text: '🚀 Start', callback_data: 'show_menu' }]],
      },
    });
  }

  @Action('show_menu')
  async showMenu(@Ctx() ctx: BotContext) {
    const telegramId = ctx.from?.id.toString();
    const existing = await this.walletService.findByUserId(telegramId!);

    const inlineKeyboard: any[] = [];

    if (!existing) {
      inlineKeyboard.push([{ text: '🆕 Register', callback_data: 'register' }]);
    }

    if (existing) {
      inlineKeyboard.push(
        [
          { text: '💸 Send USD', callback_data: 'send_usd' },
          { text: '📥 Receive USD', callback_data: 'receive_usd' },
        ],
        [{ text: '📥 Withdraw', callback_data: 'withdraw' }],
        [
          { text: '💰 Check Balance', callback_data: 'check_balance' },
          {
            text: '📝 Transaction History',
            callback_data: 'transaction_history',
          },
        ],
        [
          { text: '⚙️ Settings', callback_data: 'settings' },
          { text: '❓ Help / Support', callback_data: 'help_support' },
        ],
      );
    }

    await ctx.reply(`Starkment is a global payment app.\nChoose an option:`, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  }

  @Action('register')
  async register(@Ctx() ctx: BotContext) {
    const telegramId = ctx.from?.id.toString();

    ctx.session = ctx.session || {};
    ctx.session.awaitingPin = true;
    ctx.session.telegramId = telegramId;

    const existing = await this.walletService.findByUserId(
      ctx.session.telegramId!,
    );
    if (existing) {
      await ctx.reply('⚠️ Account and transaction PIN are already set.');
      ctx.session.awaitingPin = false;
      ctx.session.telegramId = undefined;
      return this.showMenu(ctx);
    }

    await ctx.reply('Please create a 4-digit transaction PIN:');
  }

  // --- Receive USD Flow ---
  @Action('receive_usd')
  async sendMoney(@Ctx() ctx: BotContext) {
    ctx.session = ctx.session || {};
    ctx.session.awaitingPin = true;
    ctx.session.action = 'receive_usd';
    await ctx.reply('💸 Please enter your transaction PIN to continue:');
  }

  // --- Send USD Flow ---
  @Action('send_usd')
  async sendUsd(@Ctx() ctx: BotContext) {
    ctx.session = ctx.session || {};
    ctx.session.awaitingPin = true;
    ctx.session.action = 'send_usd';
    await ctx.reply('💸 Please enter your transaction PIN to continue:');
  }

  @On('text')
  async handleText(
    @Ctx()
    ctx: BotContext & {
      message: TgUpdate.New & TgUpdate.NonChannel & Message.TextMessage;
    },
  ) {
    const text = ctx.message.text.trim();

    // PIN Handling
    if (ctx.session?.awaitingPin) {
      if (
        ctx.session.action === 'receive_usd' ||
        ctx.session.action === 'send_usd'
      ) {
        return this.handlePinVerification(ctx, text);
      }
      return this.handlePinSetup(ctx, text);
    }

    // Email Handling
    if (ctx.session?.awaitingEmail) {
      return this.handleEmailSetup(ctx, text);
    }

    // Recipient Address Handling, Username (Send USD Flow)
    if (ctx.session?.awaitingRecipient) {
      return this.handleRecipientInput(ctx, text);
    }

    // Amount Handling (Send or Receive Flow)
    if (ctx.session?.awaitingAmount) {
      return this.handleAmountSetup(ctx, text);
    }

    // Default: Unrecognized Input
    await ctx.reply(
      '🤔 I didn’t understand that. Please use the menu buttons.',
    );
  }

  // --- Handle PIN Setup ---
  private async handlePinSetup(ctx: BotContext, pin: string) {
    if (!/^\d{4}$/.test(pin)) {
      return ctx.reply('❌ Invalid PIN. Please enter a 4-digit number:');
    }

    await ctx.deleteMessage(ctx.message.message_id);

    const message = await this.walletService.saveUserWalletDetails(
      ctx.session!.telegramId!,
      pin,
      ctx.from?.username || '',
      undefined,
    );

    await ctx.reply(message, { parse_mode: 'HTML' });

    ctx.session!.awaitingPin = false;
    ctx.session!.awaitingEmail = true;
  }

  // --- Handle Email Setup ---
  private async handleEmailSetup(ctx: BotContext, email: string) {
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return ctx.reply('❌ Invalid email format. Please try again:');
    }

    await this.walletService.updateEmail(ctx.from!.id.toString(), email);

    await ctx.reply(`✅ Email saved successfully: ${email}`);
    ctx.session!.awaitingEmail = false;

    return this.showMenu(ctx);
  }

  // --- Handle PIN Verification
  private async handlePinVerification(ctx: BotContext, enteredPin: string) {
    const telegramId = ctx.from?.id.toString();
    const wallet = await this.walletService.findByUserId(telegramId!);

    if (!wallet) {
      await ctx.reply('⚠️ No wallet found. Please register first.');
      ctx.session!.awaitingPin = false;
      ctx.session!.action = undefined;
      return this.showMenu(ctx);
    }

    await ctx.deleteMessage(ctx.message.message_id);

    const isMatch = await bcrypt.compare(enteredPin, wallet.transactionPin);
    if (!isMatch) {
      return ctx.reply('❌ Incorrect PIN. Please try again:');
    }

    ctx.session!.awaitingPin = false;
    ctx.session!.walletAddress = wallet.walletAddress;

    if (ctx.session!.action === 'receive_usd') {
      ctx.session!.awaitingAmount = true;
      await ctx.reply(
        '✅ PIN verified!\n\n💰 Please enter the amount of USDT:',
      );
    } else if (ctx.session!.action === 'send_usd') {
      ctx.session!.awaitingRecipient = true;
      await ctx.reply(
        '✅ PIN verified!\n\n📤 Please enter the recipient username:',
      );
    }
  }

  // --- Handle Recipient Address Input ---
  private async handleRecipientInput(ctx: BotContext, address: string) {
    ctx.session!.recipientAddress = address;
    ctx.session!.awaitingRecipient = false;
    ctx.session!.awaitingAmount = true;

    await ctx.reply('Please enter the amount of USDT to send:');
  }

  // --- Handle Send or Receive Amount Input ---
  private async handleAmountSetup(ctx: BotContext, text: string) {
    const amount = Number(text.trim());
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount. Please enter a valid number:');
    }

    try {
      await ctx.reply('⏳ Processing transaction...');

      const telegramId = ctx.from?.id.toString();
      const wallet = await this.walletService.findByUserId(telegramId!);

      if (!wallet) {
        await ctx.reply('⚠️ Wallet not found. Please register first.');
        return this.showMenu(ctx);
      }

      // Check action type
      if (ctx.session?.action === 'send_usd') {
        const to = ctx.session!.recipientAddress!;
        const getUserWalletAddress =
          await this.walletService.getWalletAddressByUsername(to);

        // ✅ Decrypt stored private key before using it
        if (!wallet.privateKey || !wallet.iv || !wallet.authTag) {
          await ctx.reply('⚠️ Encrypted key data missing for this wallet.');
          return this.showMenu(ctx);
        }

        let decryptedPrivateKey: string;
        try {
          decryptedPrivateKey = decrypt(
            wallet.privateKey,
            wallet.iv,
            wallet.authTag,
          );
        } catch (err) {
          await ctx.reply(
            '❌ Failed to decrypt private key. Please contact support.',
          );
          throw err;
        }

        await this.transactionsService.sendUSDT(
          wallet.walletAddress, // from
          decryptedPrivateKey, // signer
          getUserWalletAddress,
          BigInt(amount),
          ctx,
        );

        await ctx.reply(
          `✅ You have successfully sent <b>${amount} USDT</b> to <code>${to}</code>`,
          { parse_mode: 'HTML' },
        );
      } else if (ctx.session?.action === 'receive_usd') {
        // todo
        // deduct from user local bank, the equivalent of usdt he needs
        await this.transactionsService.receiveUSDT(
          ctx.session!.walletAddress!,
          BigInt(amount),
          ctx,
        );

        await ctx.reply(
          `✅ You have received <b>${amount} USDT</b> into your account`,
          { parse_mode: 'HTML' },
        );
      }
    } catch (err) {
      await ctx.reply(`❌ Transaction failed: ${err.message}`);
    }

    // Cleanup session
    ctx.session!.awaitingAmount = false;
    ctx.session!.walletAddress = undefined;
    ctx.session!.recipientAddress = undefined;
    ctx.session!.action = undefined;

    return this.showMenu(ctx);
  }

  @Action('check_balance')
  async checkBalance(@Ctx() ctx: BotContext) {
    try {
      const telegramId = ctx.from?.id.toString();
      const wallet = await this.walletService.findByUserId(telegramId!);

      if (!wallet) {
        await ctx.reply('⚠️ No wallet found. Please register first.');
        return this.showMenu(ctx);
      }

      await ctx.reply('⏳ Checking your balance...');

      // Call the function to get user balance
      const balance = await this.transactionsService.getUSDTBalance(
        wallet.walletAddress,
      );

      await ctx.reply(`💰 Your USDT Balance: ${balance} USDT`);
    } catch (err) {
      await ctx.reply(`❌ Failed to check balance: ${err.message}`);
    }

    return this.showMenu(ctx);
  }
}
