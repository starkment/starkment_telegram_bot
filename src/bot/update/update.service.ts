import { Start, Ctx, Action, Update, On } from 'nestjs-telegraf';
import { TransactionsService } from 'src/transactions/transactions.service';
import { WalletService } from 'src/wallet/wallet.service';
import { Context } from 'telegraf';
import {
  Message,
  Update as TgUpdate,
} from 'telegraf/typings/core/types/typegram';
import * as bcrypt from 'bcrypt';

interface BotContext extends Context {
  session?: {
    awaitingPin?: boolean;
    awaitingEmail?: boolean;
    awaitingAmount?: boolean;
    telegramId?: string;
    walletAddress?: string;
    action?: 'register' | 'receive_usd' | 'none';
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

  @On('text')
  async handleText(
    @Ctx()
    ctx: BotContext & {
      message: TgUpdate.New & TgUpdate.NonChannel & Message.TextMessage;
    },
  ) {
    const text = ctx.message.text.trim();

    if (ctx.session?.awaitingPin) {
      if (ctx.session.action === 'receive_usd') {
        return this.handlePinVerification(ctx, text);
      }
      return this.handlePinSetup(ctx, text);
    }

    if (ctx.session?.awaitingEmail) {
      return this.handleEmailSetup(ctx, text);
    }

    if (ctx.session?.awaitingAmount) {
      return this.handleAmountSetup(ctx, text);
    }

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

  // --- Handle Amount Input ---
  private async handleAmountSetup(ctx: BotContext, text: string) {
    const amount = Number(text.trim());
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount. Please enter a valid number:');
    }

    try {
      await ctx.reply('⏳ Processing transaction...');

      // TODO
      // before this happens, user accounts has to be deducted in local currency

      await this.transactionsService.receiveUSDT(
        ctx.session!.walletAddress!,
        BigInt(amount),
        ctx,
      );

      await ctx.reply(
        `✅ You have received <b>${amount} USDT</b> into your account`,
        { parse_mode: 'HTML' },
      );
    } catch (err) {
      await ctx.reply(`❌ Transaction failed: ${err.message}`);
    }

    ctx.session!.awaitingAmount = false;
    ctx.session!.walletAddress = undefined;

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

    const isMatch = await bcrypt.compare(enteredPin, wallet.transactionPin);
    if (!isMatch) {
      return ctx.reply('❌ Incorrect PIN. Please try again:');
    }

    // ✅ PIN correct — ask for amount
    ctx.session!.awaitingPin = false;
    ctx.session!.awaitingAmount = true;
    ctx.session!.walletAddress = wallet.walletAddress;

    await ctx.reply('✅ PIN verified!\n\n💰 Please enter the amount of USDT:');
  }
}
