import crypto from 'node:crypto';
import { z } from 'zod';
import type { Api } from '../app.js';
import type { Config } from '../config.js';
import { notFound, unauthorized } from '../lib/errors.js';
import type { PanelAuth } from '../panel/auth.js';
import { answersSchema, decideSchema, minecraftNameSchema, type ApplicationService } from './applications.js';

/**
 * Bewerben auf der Webseite: erst mit Discord anmelden (OAuth2, nur „identify“ – wir sehen Name und ID, sonst
 * nichts), dann das Formular. Die Anmeldung steckt in einem signierten Cookie (2 Stunden). Im Panel: Bewerbungen
 * ansehen und entscheiden, Whitelist pflegen (Bereich „Spieler“).
 */

const STATE_COOKIE = 'mm_apply_state';
const LOGIN_COOKIE = 'mm_apply';
const STATE_SECONDS = 600;
const LOGIN_SECONDS = 7200;
const STATE_BYTES = 16;
const SECOND_MS = 1000;
const PAGE = '/mornicraft/bewerben';
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1']);

const applyBody = z.object({ minecraftName: minecraftNameSchema, answers: answersSchema });
const CODE_MAX = 200;
const STATE_MAX = 64;
const callbackQuery = z.object({
  code: z.string().min(1).max(CODE_MAX).optional(),
  state: z.string().max(STATE_MAX).optional(),
});
const statusQuery = z.object({ status: z.enum(['pending', 'accepted', 'rejected']).optional() });
const idParams = z.object({ id: z.coerce.number().int().positive() });
const whitelistBody = z.object({ name: minecraftNameSchema });
const tokenSchema = z.object({ access_token: z.string() });
const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  global_name: z.string().nullable().optional(),
});

interface ApplyLogin {
  readonly id: string;
  readonly name: string;
  readonly exp: number;
}

export interface ApplyRouteDeps {
  readonly config: Config;
  readonly auth: PanelAuth;
  readonly applications: ApplicationService;
  /** Discord-Anwendung (ID des Bots), null = kein Bot. */
  readonly discordAppId: () => Promise<string | null>;
  readonly clientSecret: string | null;
  readonly fetchImpl?: typeof fetch;
}

function cookieOf(header: string | undefined, name: string): string | null {
  const part = (header ?? '')
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

export function registerApplyRoutes(app: Api, deps: ApplyRouteDeps): void {
  const { config, applications } = deps;
  const key = crypto.createHash('sha256').update(`mm-apply:${config.secret}`).digest();
  const sign = (payload: string): string =>
    crypto.createHmac('sha256', key).update(payload).digest('base64url');
  const seal = (login: ApplyLogin): string => {
    const payload = Buffer.from(JSON.stringify(login)).toString('base64url');
    return `${payload}.${sign(payload)}`;
  };
  const open = (value: string | null): ApplyLogin | null => {
    const [payload, mac] = (value ?? '').split('.');
    if (!payload || !mac) return null;
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    const login = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ApplyLogin;
    return login.exp > Date.now() ? login : null;
  };
  const cookie = (name: string, value: string, seconds: number, host: string): string => {
    const secure = LOCAL_HOSTS.has(host.split(':')[0] ?? '') ? '' : '; Secure';
    return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`;
  };
  const redirectUri = `https://${config.domain}/api/public/apply/callback`;
  const fetchImpl = deps.fetchImpl ?? fetch;

  app.get('/api/public/apply', async (request) => {
    const login = open(cookieOf(request.headers.cookie, LOGIN_COOKIE));
    const last = login ? applications.latestOf(login.id) : undefined;
    return {
      open: applications.open(),
      discordLogin: Boolean(deps.clientSecret && (await deps.discordAppId())),
      me: login ? { name: login.name } : null,
      application: last
        ? { status: last.status, minecraftName: last.minecraftName, createdAt: last.createdAt }
        : null,
    };
  });

  app.get('/api/public/apply/login', async (request, reply) => {
    const appId = await deps.discordAppId();
    if (!deps.clientSecret || !appId) return reply.redirect(`${PAGE}?fehler=discord_login_off`);
    const state = crypto.randomBytes(STATE_BYTES).toString('hex');
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
  });

  app.get(
    '/api/public/apply/callback',
    { schema: { querystring: callbackQuery } },
    async (request, reply) => {
      const expected = cookieOf(request.headers.cookie, STATE_COOKIE);
      const appId = await deps.discordAppId();
      const { code, state } = request.query;
      if (!code || !state || state !== expected || !appId || !deps.clientSecret)
        return reply.redirect(`${PAGE}?fehler=discord_login_failed`);
      const token = await fetchImpl(`${config.discordApi}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: deps.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }).toString(),
      });
      const access = tokenSchema.safeParse(token.ok ? await token.json() : null);
      if (!access.success) return reply.redirect(`${PAGE}?fehler=discord_login_failed`);
      const me = await fetchImpl(`${config.discordApi}/users/@me`, {
        headers: { authorization: `Bearer ${access.data.access_token}` },
      });
      const user = userSchema.safeParse(me.ok ? await me.json() : null);
      if (!user.success) return reply.redirect(`${PAGE}?fehler=discord_login_failed`);
      const host = request.headers.host ?? '';
      reply.header('set-cookie', [
        cookie(STATE_COOKIE, '', 0, host),
        cookie(
          LOGIN_COOKIE,
          seal({
            id: user.data.id,
            name: user.data.global_name || user.data.username,
            exp: Date.now() + LOGIN_SECONDS * SECOND_MS,
          }),
          LOGIN_SECONDS,
          host,
        ),
      ]);
      return reply.redirect(PAGE);
    },
  );

  app.post('/api/public/apply', { schema: { body: applyBody } }, async (request) => {
    const login = open(cookieOf(request.headers.cookie, LOGIN_COOKIE));
    if (!login) throw unauthorized('apply_login_required');
    const a = applications.apply({
      minecraftName: request.body.minecraftName,
      answers: request.body.answers,
      discordId: login.id,
      discordName: login.name,
      via: 'website',
    });
    return { status: a.status, minecraftName: a.minecraftName, createdAt: a.createdAt };
  });

  app.post('/api/public/apply/logout', async (request, reply) => {
    reply.header('set-cookie', cookie(LOGIN_COOKIE, '', 0, request.headers.host ?? ''));
    return { ok: true };
  });

  // ---------- Panel ----------
  app.get('/api/panel/applications', { schema: { querystring: statusQuery } }, async (request) => {
    await deps.auth.require(request, 'players');
    return applications.list(request.query.status);
  });

  app.post(
    '/api/panel/applications/:id/decide',
    { schema: { params: idParams, body: decideSchema } },
    async (request) => {
      const user = await deps.auth.require(request, 'players');
      return applications.decide(request.params.id, request.body.accept, user.username, request.body.note);
    },
  );

  app.get('/api/panel/whitelist', async (request) => {
    await deps.auth.require(request, 'players');
    return applications.whitelist();
  });

  app.post('/api/panel/whitelist', { schema: { body: whitelistBody } }, async (request) => {
    const user = await deps.auth.require(request, 'players');
    return applications.allow(request.body.name, user.username);
  });

  app.delete('/api/panel/whitelist/:id', { schema: { params: idParams } }, async (request) => {
    await deps.auth.require(request, 'players');
    if (!applications.disallow(request.params.id)) throw notFound('whitelist_entry_unknown');
    return { ok: true };
  });
}
