import { Start, Ctx, Action, Update, On } from 'nestjs-telegraf';
import { WalletService } from 'src/wallet/wallet.service';
import { Context } from 'telegraf';
import {
  Message,
  Update as TgUpdate,
} from 'telegraf/typings/core/types/typegram';

interface BotContext extends Context {
  session?: {
    awaitingPin?: boolean;
    telegramId?: string;
  };
}

@Update()
export class UpdateService {
  constructor(private readonly walletService: WalletService) {}

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
    await ctx.reply(`Starkment is a global payment app.\nChoose an option:`, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🆕 Register', callback_data: 'register' }],
          [
            { text: '💸 Send Money', callback_data: 'send_money' },
            { text: '📥 Receive Money', callback_data: 'receive_money' },
          ],
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
        ],
      },
    });
  }

  @Action('register')
  async register(@Ctx() ctx: BotContext) {
    const telegramId = ctx.from?.id.toString();

    ctx.session = ctx.session || {};
    ctx.session.awaitingPin = true;
    ctx.session.telegramId = telegramId;

    await ctx.reply('Please create a 4-digit transaction PIN:');
  }

  @On('text')
  async handleText(
    @Ctx()
    ctx: BotContext & {
      message: TgUpdate.New & TgUpdate.NonChannel & Message.TextMessage;
    },
  ) {
    if (ctx.session?.awaitingPin) {
      const pin = ctx.message.text;

      if (!/^\d{4}$/.test(pin)) {
        return ctx.reply('❌ Invalid PIN. Please enter a 4-digit number:');
      }

      // Save user with hashed PIN
      const message = await this.walletService.saveUserWalletDetails(
        ctx.session.telegramId!,
        pin,
      );

      await ctx.reply(message, { parse_mode: 'HTML' });

      // Reset session
      ctx.session.awaitingPin = false;
      ctx.session.telegramId = undefined;
    }
  }
}
