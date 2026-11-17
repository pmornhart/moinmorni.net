import crypto from 'node:crypto';
import { z } from 'zod';
import type { Api } from '../app.js';
import {
  cookie,
  cookieOf,
  createApplyLogin,
  LOGIN_COOKIE,
  LOGIN_SECONDS,
  STATE_COOKIE,
  STATE_SECONDS,
  type ApplyLoginKit,
} from '../applications/login.js';
import type { Config } from '../config.js';
import { forbidden, notFound, unauthorized } from '../lib/errors.js';
import type { PanelAuth } from '../panel/auth.js';
import {
  answersSchema,
  mayDecideMornicraft,
  minecraftNameSchema,
  type ApplicationService,
} from './applications.js';

/**
 * Bewerben auf der Webseite: erst mit Discord anmelden (OAuth2, nur „identify“ – wir sehen Name und ID, sonst
 * nichts), dann das Formular. Die Anmeldung steckt in einem signierten Cookie (2 Stunden). Im Panel: Bewerbungen
 * ansehen und entscheiden, Whitelist pflegen (Bereich „Spieler“). Die Anmeldung gilt auch für Team-Bewerbungen
 * (`?ziel=team` → zurück auf /team/bewerben).
 */

const STATE_BYTES = 16;
/**
 * Grenzen pro Besucher und Minute: Jede Rückkehr von Discord kostet zwei Anfragen bei Discord (mit dem Client-Secret),
 * jede Bewerbung eine Zeile in der Datenbank und eine Nachricht im Team-Kanal – genug für Menschen, zu wenig zum Fluten.
 */
const LOGIN_LIMIT = { max: 20, timeWindow: '1 minute' } as const;
const APPLY_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
/** Wohin es nach der Anmeldung mit Discord zurückgeht. */
const PAGES = { mornicraft: '/mornicraft/bewerben', team: '/team/bewerben' } as const;
type Target = keyof typeof PAGES;
const STATE_SEPARATOR = '.';

const applyBody = z.object({ minecraftName: minecraftNameSchema, answers: answersSchema });
const CODE_MAX = 200;
const STATE_MAX = 64;
const callbackQuery = z.object({
  code: z.string().min(1).max(CODE_MAX).optional(),
  state: z.string().max(STATE_MAX).optional(),
});
const loginQuery = z.object({ ziel: z.enum(['mornicraft', 'team']).default('mornicraft') });
const statusQuery = z.object({ status: z.enum(['pending', 'accepted', 'rejected']).optional() });
const idParams = z.object({ id: z.coerce.number().int().positive() });
const whitelistBody = z.object({ name: minecraftNameSchema });
const tokenSchema = z.object({ access_token: z.string() });
const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  global_name: z.string().nullable().optional(),
});

export interface ApplyRouteDeps {
  readonly config: Config;
  readonly auth: PanelAuth;
  readonly applications: ApplicationService;
  /** Discord-Anwendung (ID des Bots), null = kein Bot. */
  readonly discordAppId: () => Promise<string | null>;
  /** Client-Secret der Anwendung (.env oder Panel), null = „Mit Discord anmelden“ ist aus. */
  readonly clientSecret: () => string | null;
  readonly login?: ApplyLoginKit;
  readonly fetchImpl?: typeof fetch;
}

const targetOf = (state: string | null): Target => {
  const wanted = (state ?? '').split(STATE_SEPARATOR)[1];
  return wanted === 'team' ? 'team' : 'mornicraft';
};

export function registerApplyRoutes(app: Api, deps: ApplyRouteDeps): void {
  const { config, applications } = deps;
  const kit = deps.login ?? createApplyLogin(config.secret);
  const redirectUri = `https://${config.domain}/api/public/apply/callback`;
  const fetchImpl = deps.fetchImpl ?? fetch;

  app.get('/api/public/apply', async (request) => {
    const login = kit.open(request.headers.cookie);
    const last = login ? applications.latestOf(login.id) : undefined;
    return {
      open: applications.open(),
      discordLogin: Boolean(deps.clientSecret() && (await deps.discordAppId())),
      me: login ? { name: login.name } : null,
      application: last
        ? { status: last.status, minecraftName: last.minecraftName, createdAt: last.createdAt }
        : null,
    };
  });

  app.get(
    '/api/public/apply/login',
    { schema: { querystring: loginQuery }, config: { rateLimit: LOGIN_LIMIT } },
    async (request, reply) => {
      const appId = await deps.discordAppId();
      const secret = deps.clientSecret();
      const page = PAGES[request.query.ziel];
      if (!secret || !appId) return reply.redirect(`${page}?fehler=discord_login_off`);
      // Zufall + Ziel („…​.team“): das Ziel steckt im Cookie, nicht in der Adresse – niemand lenkt anders hin.
      const state = `${crypto.randomBytes(STATE_BYTES).toString('hex')}${STATE_SEPARATOR}${request.query.ziel}`;
      const url = new URL('https://discord.com/oauth2/authorize');
      url.search = new URLSearchParams({
        client_id: appId,
        response_type: 'code',
        scope: 'identify',
        redirect_uri: redirectUri,
        state,
        prompt: 'none',
      }).toString();
      reply.header('set-cookie', cookie(STATE_COOKIE, state, STATE_SECONDS, request.headers.host ?? ''));
      return reply.redirect(url.toString());
    },
  );

  app.get(
    '/api/public/apply/callback',
    { schema: { querystring: callbackQuery }, config: { rateLimit: LOGIN_LIMIT } },
    async (request, reply) => {
      const expected = cookieOf(request.headers.cookie, STATE_COOKIE);
      const page = PAGES[targetOf(expected)];
      const appId = await deps.discordAppId();
      const secret = deps.clientSecret();
      const { code, state } = request.query;
      if (!code || !state || state !== expected || !appId || !secret)
        return reply.redirect(`${page}?fehler=discord_login_failed`);
      const token = await fetchImpl(`${config.discordApi}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: secret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }).toString(),
      });
      const access = tokenSchema.safeParse(token.ok ? await token.json() : null);
      if (!access.success) return reply.redirect(`${page}?fehler=discord_login_failed`);
      const me = await fetchImpl(`${config.discordApi}/users/@me`, {
        headers: { authorization: `Bearer ${access.data.access_token}` },
      });
      const user = userSchema.safeParse(me.ok ? await me.json() : null);
      if (!user.success) return reply.redirect(`${page}?fehler=discord_login_failed`);
      const host = request.headers.host ?? '';
      reply.header('set-cookie', [
        cookie(STATE_COOKIE, '', 0, host),
        cookie(
          LOGIN_COOKIE,
          kit.seal({ id: user.data.id, name: user.data.global_name || user.data.username }),
          LOGIN_SECONDS,
          host,
        ),
      ]);
      return reply.redirect(page);
    },
  );

  app.post(
    '/api/public/apply',
    { schema: { body: applyBody }, config: { rateLimit: APPLY_LIMIT } },
    async (request) => {
      const login = kit.open(request.headers.cookie);
      if (!login) throw unauthorized('apply_login_required');
      const a = applications.apply({
        minecraftName: request.body.minecraftName,
        answers: request.body.answers,
        discordId: login.id,
        discordName: login.name,
        via: 'website',
      });
      return { status: a.status, minecraftName: a.minecraftName, createdAt: a.createdAt };
    },
  );

  app.post('/api/public/apply/logout', async (request, reply) => {
    reply.header('set-cookie', cookie(LOGIN_COOKIE, '', 0, request.headers.host ?? ''));
    return { ok: true };
  });

  // ---------- Panel ----------
  app.get('/api/panel/applications', { schema: { querystring: statusQuery } }, async (request) => {
    await deps.auth.require(request, 'players');
    return applications.list(request.query.status);
  });

  // Entscheiden (MorniCraft und Team) steht in applications/routes.ts.

  app.get('/api/panel/whitelist', async (request) => {
    await deps.auth.require(request, 'players');
    return applications.whitelist();
  });

  // Eintragen und Austragen wie Bewerbungen entscheiden: nur, wer kicken darf (sonst ginge es an der Bewerbung vorbei).
  app.post('/api/panel/whitelist', { schema: { body: whitelistBody } }, async (request) => {
    const user = await deps.auth.require(request, 'players');
    if (!mayDecideMornicraft(user.role)) throw forbidden('mornicraft_no_right');
    return applications.allow(request.body.name, user.username);
  });

  app.delete('/api/panel/whitelist/:id', { schema: { params: idParams } }, async (request) => {
    const user = await deps.auth.require(request, 'players');
    if (!mayDecideMornicraft(user.role)) throw forbidden('mornicraft_no_right');
    if (!applications.disallow(request.params.id)) throw notFound('whitelist_entry_unknown');
    return { ok: true };
  });
}
