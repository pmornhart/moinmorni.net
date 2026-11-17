import { z } from 'zod';
import type { Api } from '../app.js';
import type { DiscordCredentials } from '../discord/credentials.js';
import type { MoinMorniBot } from '../discord/bot.js';
import { friendlyDiscordError } from '../discord/appearance.js';
import { AppError, badRequest, forbidden } from '../lib/errors.js';
import type { PanelAuth } from './auth.js';

/**
 * Panel → Discord: Zustand des Bots, Zugang (Bot-Token und Client-Secret – nur der Owner, gespeichert versiegelt, nie
 * wieder angezeigt), „Server einrichten“ mit Fortschritt und das Aussehen (Server-Symbol, Banner, Bild und Name des
 * Bots). Ein Wert aus der .env gilt und lässt sich hier nicht ändern.
 */

const OWNER = 'owner';
const HTTP_BAD_GATEWAY = 502;
const CHECK_LIMIT = 10;
const APPEARANCE_LIMIT = 20;
/** Bilder kommen als Text („data:image/png;base64,…“) – bis 10 MB Bild sind das etwa 14 MB. */
const IMAGE_BODY_LIMIT = 15_000_000;
const TOKEN_MIN = 50;
const TOKEN_MAX = 120;
const SECRET_MIN = 16;
const SECRET_MAX = 128;
const IMAGE_MAX = 14_000_000;
// Bot-Token: drei Teile mit Punkten (Base64url), z. B. "teil_eins_xxxxxxxxxxxx.zwei.teil_drei_xxxxxxxxxxxx" – mit
// Leerzeichen oder ohne Punkte nicht.
// https://regex101.com/?flavor=javascript&regex=%5E%5BA-Za-z0-9_-%5D%7B20%2C%7D%5C.%5BA-Za-z0-9_-%5D%7B4%2C%7D%5C.%5BA-Za-z0-9_-%5D%7B20%2C%7D%24&testString=teil_eins_xxxxxxxxxxxx.zwei.teil_drei_xxxxxxxxxxxx
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{20,}$/;
// Client-Secret: Buchstaben, Ziffern, _ und -, z. B. "aBcD_123-xyz…"; mit Leerzeichen nicht.
// https://regex101.com/?flavor=javascript&regex=%5E%5BA-Za-z0-9_-%5D%2B%24&testString=aBcD_123-xyzaBcD_123-xyz
const SECRET_SHAPE = /^[A-Za-z0-9_-]+$/;

const tokenBody = z.object({ token: z.string().trim().min(TOKEN_MIN).max(TOKEN_MAX) });
const secretBody = z.object({ secret: z.string().trim().min(SECRET_MIN).max(SECRET_MAX) });
const imageSchema = z.string().max(IMAGE_MAX);
const iconBody = z.object({ image: z.union([z.literal('logo'), imageSchema]) });
const bannerBody = z.object({ image: imageSchema.nullable() });
const botBody = z.object({
  name: z.string().max(SECRET_MAX).optional(),
  avatar: z.union([z.literal('logo'), imageSchema]).optional(),
});

export function registerDiscordRoutes(
  app: Api,
  auth: PanelAuth,
  bot: MoinMorniBot,
  credentials: DiscordCredentials,
): void {
  /** Token und Client-Secret ändert nur der Owner („Bot verbinden“). */
  const owner = async (request: Parameters<PanelAuth['require']>[0]) => {
    const user = await auth.require(request, 'discord');
    if (user.role.id !== OWNER) throw forbidden('discord_owner_only');
    return user;
  };
  const notFromEnv = (kind: 'token' | 'clientSecret'): void => {
    if (credentials.view()[kind].source === 'env') throw badRequest('discord_credential_from_env');
  };

  app.get('/api/panel/discord', async (request) => {
    const user = await auth.require(request, 'discord');
    return { ...(await bot.status()), canEditAccess: user.role.id === OWNER };
  });

  app.put(
    '/api/panel/discord/token',
    { schema: { body: tokenBody }, config: { rateLimit: { max: CHECK_LIMIT, timeWindow: '1 minute' } } },
    async (request) => {
      const user = await owner(request);
      notFromEnv('token');
      const token = request.body.token;
      if (!TOKEN_SHAPE.test(token)) throw badRequest('discord_token_format');
      // Erst bei Discord fragen, wer das ist – ein falscher Token wird gar nicht erst gespeichert.
      const me = await bot.checkToken(token).catch((err: unknown) => {
        const code = err instanceof Error ? err.message : 'discord_unreachable';
        throw code === 'discord_unreachable'
          ? new AppError(HTTP_BAD_GATEWAY, code)
          : badRequest(code.startsWith('discord_') ? code : 'discord_token_invalid');
      });
      credentials.save('token', token, user.username);
      bot.reconnect();
      return { bot: me, credentials: credentials.view() };
    },
  );

  app.delete('/api/panel/discord/token', async (request) => {
    const user = await owner(request);
    notFromEnv('token');
    credentials.save('token', null, user.username);
    bot.reconnect();
    return { credentials: credentials.view() };
  });

  app.put(
    '/api/panel/discord/client-secret',
    { schema: { body: secretBody }, config: { rateLimit: { max: CHECK_LIMIT, timeWindow: '1 minute' } } },
    async (request) => {
      const user = await owner(request);
      notFromEnv('clientSecret');
      const secret = request.body.secret;
      if (!SECRET_SHAPE.test(secret)) throw badRequest('discord_secret_format');
      if (!credentials.token()) throw badRequest('discord_token_first');
      const ok = await bot.checkClientSecret(secret).catch(() => {
        throw new AppError(HTTP_BAD_GATEWAY, 'discord_unreachable');
      });
      if (!ok) throw badRequest('discord_secret_invalid');
      credentials.save('clientSecret', secret, user.username);
      return { credentials: credentials.view() };
    },
  );

  app.delete('/api/panel/discord/client-secret', async (request) => {
    const user = await owner(request);
    notFromEnv('clientSecret');
    credentials.save('clientSecret', null, user.username);
    return { credentials: credentials.view() };
  });

  /** Einrichtung starten – sie läuft im Hintergrund, den Fortschritt zeigt GET /api/panel/discord. */
  app.post('/api/panel/discord/setup', async (request) => {
    await auth.require(request, 'discord');
    try {
      return bot.startSetup();
    } catch (err) {
      if (err instanceof Error && err.message === 'discord_no_guild') throw badRequest('discord_no_guild');
      if (err instanceof Error && err.message === 'discord_not_configured')
        throw badRequest('discord_not_configured');
      throw err;
    }
  });

  // ---------- Aussehen ----------
  /**
   * Bilder dürfen groß sein (bis 15 MB als Text) – darum erst schauen, wer fragt, und dann lesen: Unangemeldete
   * bekommen ihr „nein“, bevor der Server 15 MB annimmt und auswertet.
   */
  const signedInFirst = {
    onRequest: async (request: Parameters<PanelAuth['require']>[0]): Promise<void> => {
      await auth.require(request, 'discord');
    },
  };
  const appearance = async <T>(job: () => Promise<T>): Promise<T> => {
    try {
      return await job();
    } catch (err) {
      if (err instanceof AppError) throw err;
      return friendlyDiscordError(err);
    }
  };

  app.get('/api/panel/discord/appearance', async (request) => {
    await auth.require(request, 'discord');
    return appearance(() => bot.appearance.view());
  });

  app.put(
    '/api/panel/discord/appearance/icon',
    {
      ...signedInFirst,
      schema: { body: iconBody },
      bodyLimit: IMAGE_BODY_LIMIT,
      config: { rateLimit: { max: APPEARANCE_LIMIT, timeWindow: '1 minute' } },
    },
    async (request) => {
      const user = await auth.require(request, 'discord');
      return appearance(() => bot.appearance.setIcon(request.body.image, user.username));
    },
  );

  app.put(
    '/api/panel/discord/appearance/banner',
    {
      ...signedInFirst,
      schema: { body: bannerBody },
      bodyLimit: IMAGE_BODY_LIMIT,
      config: { rateLimit: { max: APPEARANCE_LIMIT, timeWindow: '1 minute' } },
    },
    async (request) => {
      const user = await auth.require(request, 'discord');
      return appearance(() => bot.appearance.setBanner(request.body.image, user.username));
    },
  );

  app.put(
    '/api/panel/discord/appearance/bot',
    {
      ...signedInFirst,
      schema: { body: botBody },
      bodyLimit: IMAGE_BODY_LIMIT,
      config: { rateLimit: { max: APPEARANCE_LIMIT, timeWindow: '1 minute' } },
    },
    async (request) => {
      await auth.require(request, 'discord');
      return appearance(() =>
        bot.appearance.setBot({
          ...(request.body.name !== undefined ? { name: request.body.name } : {}),
          ...(request.body.avatar !== undefined ? { avatar: request.body.avatar } : {}),
        }),
      );
    },
  );
}
