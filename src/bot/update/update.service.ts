import { Start, Ctx, Action, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';

@Update()
export class UpdateService {
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
    await ctx.reply(`Starkment is global payment app` + `Choose an option:`, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'send money',
              callback_data: 'send_money',
            },
          ],
        ],
      },
    });
  }
}
