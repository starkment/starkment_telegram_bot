import { Start, Ctx, Action, Update } from 'nestjs-telegraf';
import { WalletService } from 'src/wallet/wallet.service';
import { Context } from 'telegraf';

@Update()
export class UpdateService {
  constructor(private readonly walletService: WalletService) {}

  @Start()
  async start(@Ctx() ctx: Context) {
    await ctx.reply('Welcome to Starkment Bot!\n\n', {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Start',
              callback_data: 'show_menu',
            },
          ],
        ],
      },
    });
  }

  @Action('show_menu')
  async showMenu(@Ctx() ctx: Context) {
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
  async register(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id.toString(); // Telegram user ID
    const message = await this.walletService.saveUserWalletDetails(telegramId);

    await ctx.reply(message, { parse_mode: 'HTML' });
  }
}
