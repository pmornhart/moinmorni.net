import type { Api } from '../app.js';
import type { MoinMorniBot } from '../discord/bot.js';
import { badRequest } from '../lib/errors.js';
import type { PanelAuth } from './auth.js';

/** Panel: Zustand des Discord-Bots und „Server einrichten“ (Bereich discord). */
export function registerDiscordRoutes(app: Api, auth: PanelAuth, bot: MoinMorniBot): void {
  app.get('/api/panel/discord', async (request) => {
    await auth.require(request, 'discord');
    return bot.status();
  });

  app.post('/api/panel/discord/setup', async (request) => {
    await auth.require(request, 'discord');
    try {
      return await bot.setup();
    } catch (err) {
      if (err instanceof Error && err.message === 'discord_no_guild') throw badRequest('discord_no_guild');
      if (err instanceof Error && err.message === 'discord_not_configured')
        throw badRequest('discord_not_configured');
      throw err;
    }
  });
}
