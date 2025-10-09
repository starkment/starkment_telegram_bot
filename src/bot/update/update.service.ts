import { Start, Ctx, Action, Update, On } from 'nestjs-telegraf';
import { TransactionsService } from 'src/transactions/transactions.service';
import { WalletService } from 'src/wallet/wallet.service';
import { Context } from 'telegraf';
import {
  Message,
  Update as TgUpdate,
} from 'telegraf/typings/core/types/typegram';

interface BotContext extends Context {
  session?: {
    awaitingPin?: boolean;
    awaitingEmail?: boolean;
    telegramId?: string;

    awaitingRecipient?: boolean;
    awaitingAmount?: boolean;
    recipientAddress?: string;
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

    // Build menu dynamically
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

    // Check if wallet already exists
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
    ctx.session.awaitingRecipient = true;

    await ctx.reply('💸 Please enter the recipient username:');
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
      return this.handlePinSetup(ctx, text);
    }

    if (ctx.session?.awaitingEmail) {
      return this.handleEmailSetup(ctx, text);
    }

    if (ctx.session?.awaitingRecipient) {
      return this.handleRecipientSetup(ctx, text);
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

  // --- Handle Recipient Address ---
  private async handleRecipientSetup(ctx: BotContext, recipient: string) {
    ctx.session!.recipientAddress = recipient.trim();
    ctx.session!.awaitingRecipient = false;
    ctx.session!.awaitingAmount = true;

    await ctx.reply('✅ Enter the amount of USD to send:');
  }

  // --- Handle Sending Amount ---
  private async handleAmountSetup(ctx: BotContext, text: string) {
    const amount = Number(text.trim());
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount. Please enter a valid number:');
    }

    try {
      await ctx.reply('⏳ Processing transaction...');

      const tx = await this.transactionsService.receiveUSDT(
        ctx.session!.recipientAddress!,
        BigInt(amount),
        ctx,
      );

      await ctx.reply(
        `✅ Sent <b>${amount} USDT</b> to <code>${ctx.session!.recipientAddress}</code>\n\n🔗 Tx Hash: <code>${tx.transaction_hash}</code>`,
        { parse_mode: 'HTML' },
      );
    } catch (err) {
      await ctx.reply(`❌ Transaction failed: ${err.message}`);
    }

    ctx.session!.awaitingAmount = false;
    ctx.session!.recipientAddress = undefined;
  }
}
