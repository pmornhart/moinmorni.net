/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/require-regex-example, ts-patterns/no-param-reassign -- a fake Discord: ids, bit numbers and status codes as Discord sends them; each route regex is the Discord path written next to it ("/guilds/900/roles" matches /^\/guilds\/(\d+)\/roles$/); the fake keeps Discord's state in mutable objects like Discord does */
/**
 * Nachgebautes Discord für Tests: REST (Rollen mit Reihenfolge, Kanäle, Nachrichten, Mitglieder, Banns, Befehle,
 * Threads, Antworten auf Klicks, Server-Symbol/Banner, Profilbild und Name des Bots, Stummschalten im Sprachkanal),
 * ein Bilder-Server (CDN) und ein Gateway, das READY und GUILD_CREATE schickt. Mit den Regeln, an denen ein echter Bot
 * scheitert: Er vergibt nur Rechte, die er selbst hat, bearbeitet nur Rollen unter seiner eigenen, schreibt nur in
 * Kanäle, die er sieht, und braucht „Server verwalten“ fürs Server-Symbol. Auf Wunsch antwortet es mit 429 („zu viele
 * Anfragen“).
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';

interface FRole {
  id: string;
  name: string;
  color: number;
  permissions: string;
  hoist: boolean;
  mentionable: boolean;
  position: number;
  managed: boolean;
  /** Rollen-Symbol (Bild) – nur mit der Funktion „ROLE_ICONS“ (Boost-Stufe 2). */
  icon?: string | null;
  unicode_emoji?: string | null;
}
interface FOverwrite {
  id: string;
  type: number;
  allow: string;
  deny: string;
}
interface FChannel {
  id: string;
  name: string;
  type: number;
  parent_id?: string | null;
  topic?: string;
  permission_overwrites?: FOverwrite[];
  archived?: boolean;
  locked?: boolean;
  members?: string[];
}
interface FMember {
  roles: string[];
  communication_disabled_until: string | null;
  /** Server-Stummschaltung im Sprachkanal. */
  mute?: boolean;
  /** Sprachkanal, in dem die Person gerade sitzt (null = in keinem). */
  channel_id?: string | null;
}
interface FMessage {
  id: string;
  content?: string;
  embeds?: unknown[];
  components?: unknown[];
}
interface FImage {
  mime: string;
  bytes: Buffer;
}
interface FBot {
  readonly token: string;
  readonly appId: string;
  readonly userId: string;
  username: string;
  avatar: string | null;
}

const BIT = (n: number): bigint => 1n << BigInt(n);
const ADMIN = BIT(3);
const MANAGE_GUILD = BIT(5);
const VIEW = BIT(10);
const SEND = BIT(11);
const MANAGE_ROLES = BIT(28);
/** Discord nimmt Rollen-Symbole bis 256 KB. */
const ROLE_ICON_MAX_BYTES = 262_144;
const EVERYONE_DEFAULT = (BIT(6) | VIEW | SEND | BIT(14) | BIT(15) | BIT(16) | BIT(20) | BIT(21)).toString();

/**
 * Bot-Tokens in der Form echter (drei Teile mit Punkten), aber erkennbar ausgedacht – gelten nur für dieses
 * nachgebaute Discord.
 */
export const FAKE_TOKENS = {
  main: 'fake_main_bot_token_aaaaaa.fakefake.moinmorni_fake_main_bot_token_0123456789',
  other: 'fake_other_bot_token_bbbbb.fakefake.moinmorni_fake_other_bot_token_98765432',
} as const;
/** Client-Secret der Anwendung des Haupt-Bots (32 Zeichen wie bei Discord, ausgedacht). */
export const FAKE_CLIENT_SECRET = 'moinmorni-fake-client-secret-123';

export interface FakeDiscord {
  readonly api: string;
  readonly cdn: string;
  readonly guild: {
    id: string;
    name: string;
    features: string[];
    verification_level: number;
    premium_tier: number;
    icon: string | null;
    banner: string | null;
    roles: Map<string, FRole>;
    channels: Map<string, FChannel>;
    members: Map<string, FMember>;
    bans: Set<string>;
  };
  /** Was der Bot darf – wie im echten Discord: ohne „Mitglieder stummschalten“ antwortet es 403. */
  readonly permissions: { muteMembers: boolean };
  readonly messages: Map<string, FMessage[]>;
  readonly commands: unknown[];
  readonly replies: Array<{ id: string; body: { type: number; data: Record<string, unknown> } }>;
  /** Alle Anfragen (Methode, Pfad, Kopf „authorization“ gekürzt) – um zu prüfen, dass kein Token im Pfad landet. */
  readonly requests: Array<{ method: string; path: string; body: string }>;
  readonly bots: { readonly main: FBot; readonly other: FBot };
  readonly identified: () => number;
  readonly dispatch: (t: string, d: unknown) => void;
  /** Rechte der Bot-Rolle (wie in der Einladung). */
  readonly setBotPermissions: (bits: bigint) => void;
  /** Die nächsten `times` Anfragen auf diesen Pfad bekommen 429 mit `retryAfter` Sekunden. */
  readonly limit: (method: string, path: RegExp, times: number, retryAfter: number) => void;
  /** Die Rolle des Bots (von Discord beim Einladen angelegt). */
  readonly botRole: () => FRole;
  readonly close: () => Promise<void>;
}

export async function startFakeDiscord(): Promise<FakeDiscord> {
  const ids = { n: 1000 };
  const next = (): string => String((ids.n += 1));
  const bots = {
    main: {
      token: FAKE_TOKENS.main,
      appId: '777',
      userId: '777',
      username: 'MoinMorni',
      avatar: null,
    } as FBot,
    other: {
      token: FAKE_TOKENS.other,
      appId: '888',
      userId: '888',
      username: 'Zweitbot',
      avatar: null,
    } as FBot,
  };
  const guild = {
    id: '900',
    name: 'MoinMorni',
    features: [] as string[],
    verification_level: 0,
    premium_tier: 0,
    icon: null as string | null,
    banner: null as string | null,
    roles: new Map<string, FRole>([
      [
        '900',
        {
          id: '900',
          name: '@everyone',
          color: 0,
          permissions: EVERYONE_DEFAULT,
          hoist: false,
          mentionable: false,
          position: 0,
          managed: false,
        },
      ],
      [
        '901',
        {
          id: '901',
          name: 'MoinMorni',
          color: 0,
          permissions: ADMIN.toString(),
          hoist: false,
          mentionable: false,
          position: 1,
          managed: true,
        },
      ],
    ]),
    channels: new Map<string, FChannel>(),
    members: new Map<string, FMember>([['777', { roles: ['901'], communication_disabled_until: null }]]),
    bans: new Set<string>(),
  };
  const permissions = { muteMembers: true };
  const images = new Map<string, FImage>();
  const messages = new Map<string, FMessage[]>();
  const commands: unknown[] = [];
  const replies: Array<{ id: string; body: { type: number; data: Record<string, unknown> } }> = [];
  const requests: Array<{ method: string; path: string; body: string }> = [];
  const limits: Array<{ method: string; path: RegExp; times: number; retryAfter: number }> = [];
  const sockets = new Set<WebSocket>();
  const state = { identified: 0, seq: 0 };

  const json = (res: http.ServerResponse, status: number, body?: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const notFound = (res: http.ServerResponse): void => json(res, 404, { code: 10003, message: 'Unknown' });
  const missing = (res: http.ServerResponse): void =>
    json(res, 403, { code: 50013, message: 'Missing Permissions' });
  const noAccess = (res: http.ServerResponse): void =>
    json(res, 403, { code: 50001, message: 'Missing Access' });

  // ---------- Rechte wie bei Discord ----------
  const botRole = (): FRole => guild.roles.get('901') as FRole;
  const botTop = (): number => botRole().position;
  const botPerms = (): bigint => {
    const member = guild.members.get('777');
    const perms = [...guild.roles.values()]
      .filter((r) => r.id === guild.id || member?.roles.includes(r.id))
      .reduce((acc, r) => acc | BigInt(r.permissions), 0n);
    return perms;
  };
  const isAdmin = (): boolean => (botPerms() & ADMIN) !== 0n;
  const within = (bits: string | undefined): boolean =>
    isAdmin() || (BigInt(bits ?? '0') & ~botPerms()) === 0n;
  /** Darf der Bot das in diesem Kanal? (Grundrechte, dann Überschreibungen: @everyone, Rollen, er selbst) */
  const can = (channelId: string, bit: bigint): boolean => {
    if (isAdmin()) return true;
    const ch = guild.channels.get(channelId);
    const roles = guild.members.get('777')?.roles ?? [];
    const base = botPerms();
    const ows = ch?.permission_overwrites ?? [];
    const everyone = ows.find((o) => o.id === guild.id);
    const afterEveryone = everyone ? (base & ~BigInt(everyone.deny)) | BigInt(everyone.allow) : base;
    const roleOws = ows.filter((o) => o.type === 0 && roles.includes(o.id));
    const deny = roleOws.reduce((acc, o) => acc | BigInt(o.deny), 0n);
    const allow = roleOws.reduce((acc, o) => acc | BigInt(o.allow), 0n);
    const afterRoles = (afterEveryone & ~deny) | allow;
    const mine = ows.find((o) => o.type === 1 && o.id === '777');
    const final = mine ? (afterRoles & ~BigInt(mine.deny)) | BigInt(mine.allow) : afterRoles;
    return (final & bit) === bit;
  };
  const overwritesOk = (ows: unknown): boolean =>
    isAdmin() || ((ows as FOverwrite[] | undefined) ?? []).every((o) => within(o.allow) && within(o.deny));
  /** Neue Rolle ganz unten (über @everyone), alle anderen rutschen hoch. */
  const insertRole = (role: FRole): void => {
    guild.roles.forEach((r) => {
      if (r.id !== guild.id) r.position += 1;
    });
    guild.roles.set(role.id, { ...role, position: 1 });
  };
  const normalize = (): void => {
    [...guild.roles.values()]
      .filter((r) => r.id !== guild.id)
      .sort((a, b) => a.position - b.position || Number(a.id) - Number(b.id))
      .forEach((r, i) => {
        r.position = i + 1;
      });
  };
  const storeImage = (data: unknown): string | null => {
    if (data === null) return null;
    const text = String(data);
    const mime = /^data:([^;]+);base64,/.exec(text)?.[1] ?? 'image/png';
    const bytes = Buffer.from(text.slice(text.indexOf(',') + 1), 'base64');
    const animated = mime === 'image/gif';
    const hash = `${animated ? 'a_' : ''}h${next()}`;
    images.set(hash, { mime, bytes });
    return hash;
  };
  /**
   * Rollen-Symbol wie bei Discord: nur mit der Funktion „ROLE_ICONS“, höchstens 256 KB; Bild und Emoji schließen sich
   * aus. Gibt einen Fehlertext zurück, wenn Discord ablehnen würde.
   */
  const roleIcon = (role: FRole, b: Record<string, unknown>): string | null => {
    if (!('icon' in b) && !('unicode_emoji' in b)) return null;
    if (!guild.features.includes('ROLE_ICONS')) return 'ROLE_ICONS';
    if ('icon' in b) {
      const data = b['icon'];
      if (
        data !== null &&
        Buffer.from(String(data).slice(String(data).indexOf(',') + 1), 'base64').length > ROLE_ICON_MAX_BYTES
      )
        return 'TOO_BIG';
      role.icon = storeImage(data);
      if (role.icon) role.unicode_emoji = null;
    }
    if ('unicode_emoji' in b) {
      role.unicode_emoji = (b['unicode_emoji'] as string | null) ?? null;
      if (role.unicode_emoji) role.icon = null;
    }
    return null;
  };

  type Handler = (
    m: RegExpMatchArray,
    body: Record<string, unknown>,
    res: http.ServerResponse,
    bot: FBot,
  ) => void;
  const routes: Array<[string, RegExp, Handler]> = [
    ['GET', /^\/gateway\/bot$/, (_m, _b, res) => json(res, 200, { url: `ws://127.0.0.1:${port()}` })],
    [
      'GET',
      /^\/applications\/@me$/,
      (_m, _b, res, bot) => json(res, 200, { id: bot.appId, name: bot.username }),
    ],
    [
      'GET',
      /^\/users\/@me$/,
      (_m, _b, res, bot) =>
        json(res, 200, { id: bot.userId, username: bot.username, avatar: bot.avatar, bot: true }),
    ],
    [
      'PATCH',
      /^\/users\/@me$/,
      (_m, b, res, bot) => {
        if (typeof b['username'] === 'string') bot.username = b['username'];
        if ('avatar' in b) bot.avatar = storeImage(b['avatar']);
        json(res, 200, { id: bot.userId, username: bot.username, avatar: bot.avatar, bot: true });
      },
    ],
    [
      'GET',
      /^\/guilds\/(\d+)$/,
      (_m, _b, res) =>
        json(res, 200, {
          id: guild.id,
          name: guild.name,
          features: guild.features,
          icon: guild.icon,
          banner: guild.banner,
          premium_tier: guild.premium_tier,
        }),
    ],
    [
      'PATCH',
      /^\/guilds\/(\d+)$/,
      (_m, b, res) => {
        if (!isAdmin() && (botPerms() & MANAGE_GUILD) === 0n) return missing(res);
        if ('banner' in b && b['banner'] !== null && !guild.features.includes('BANNER'))
          return json(res, 400, { code: 50035, message: 'Invalid Form Body' });
        if ('icon' in b) guild.icon = storeImage(b['icon']);
        if ('banner' in b) guild.banner = storeImage(b['banner']);
        guild.features = (b['features'] as string[]) ?? guild.features;
        guild.verification_level = Number(b['verification_level'] ?? guild.verification_level);
        return json(res, 200, {
          id: guild.id,
          name: guild.name,
          features: guild.features,
          icon: guild.icon,
          banner: guild.banner,
        });
      },
    ],
    ['GET', /^\/guilds\/(\d+)\/roles$/, (_m, _b, res) => json(res, 200, [...guild.roles.values()])],
    [
      'POST',
      /^\/guilds\/(\d+)\/roles$/,
      (_m, b, res) => {
        if (!isAdmin() && (botPerms() & MANAGE_ROLES) === 0n) return missing(res);
        if (!within(b['permissions'] as string | undefined)) return missing(res);
        const { icon: _icon, unicode_emoji: _emoji, ...rest } = b;
        const role: FRole = {
          ...(rest as unknown as FRole),
          id: next(),
          managed: false,
          position: 1,
          icon: null,
          unicode_emoji: null,
        };
        if (roleIcon(role, b)) return json(res, 400, { code: 50035, message: 'Invalid Form Body' });
        insertRole(role);
        return json(res, 200, guild.roles.get(role.id));
      },
    ],
    [
      'PATCH',
      /^\/guilds\/(\d+)\/roles$/,
      (_m, b, res) => {
        const moves = b as unknown as Array<{ id: string; position: number }>;
        if (
          moves.some((mv) => (guild.roles.get(mv.id)?.position ?? 0) >= botTop() || mv.position >= botTop())
        )
          return missing(res);
        moves.forEach((mv) => {
          const role = guild.roles.get(mv.id);
          if (role) role.position = mv.position - 0.5;
        });
        normalize();
        return json(res, 200, [...guild.roles.values()]);
      },
    ],
    [
      'PATCH',
      /^\/guilds\/(\d+)\/roles\/(\d+)$/,
      (m, b, res) => {
        const role = guild.roles.get(m[2] ?? '');
        if (!role) return notFound(res);
        if (role.position >= botTop() || role.managed) return missing(res);
        if ('permissions' in b && !within(b['permissions'] as string)) return missing(res);
        if (roleIcon(role, b)) return json(res, 400, { code: 50035, message: 'Invalid Form Body' });
        const { icon: _icon, unicode_emoji: _emoji, ...rest } = b;
        Object.assign(role, rest);
        return json(res, 200, role);
      },
    ],
    ['GET', /^\/guilds\/(\d+)\/channels$/, (_m, _b, res) => json(res, 200, [...guild.channels.values()])],
    [
      'POST',
      /^\/guilds\/(\d+)\/channels$/,
      (_m, b, res) => {
        if (!overwritesOk(b['permission_overwrites'])) return missing(res);
        const ch = { ...(b as unknown as FChannel), id: next() };
        guild.channels.set(ch.id, ch);
        return json(res, 200, ch);
      },
    ],
    [
      'PATCH',
      /^\/channels\/(\d+)$/,
      (m, b, res) => {
        const ch = guild.channels.get(m[1] ?? '');
        if (!ch) return notFound(res);
        if (!overwritesOk(b['permission_overwrites'])) return missing(res);
        Object.assign(ch, b);
        return json(res, 200, ch);
      },
    ],
    [
      'DELETE',
      /^\/channels\/(\d+)$/,
      (m, _b, res) => {
        if (!guild.channels.delete(m[1] ?? '')) return notFound(res);
        return json(res, 200, { id: m[1] });
      },
    ],
    [
      'POST',
      /^\/channels\/(\d+)\/messages$/,
      (m, b, res) => {
        const channel = m[1] ?? '';
        // Direktnachrichten (Kanal „8…“) gehen immer; im Server nur, wo der Bot sieht und schreiben darf.
        if (!channel.startsWith('8') && guild.channels.has(channel) && !can(channel, VIEW | SEND))
          return noAccess(res);
        const msg = { ...(b as unknown as FMessage), id: next() };
        messages.set(channel, [...(messages.get(channel) ?? []), msg]);
        return json(res, 200, msg);
      },
    ],
    [
      'PATCH',
      /^\/channels\/(\d+)\/messages\/(\d+)$/,
      (m, b, res) => {
        const msg = (messages.get(m[1] ?? '') ?? []).find((x) => x.id === m[2]);
        if (!msg) return notFound(res);
        if (guild.channels.has(m[1] ?? '') && !can(m[1] ?? '', VIEW)) return noAccess(res);
        // Wie Discord: neue Embeds/Knöpfe ersetzen die alten ganz.
        Object.assign(msg, b);
        return json(res, 200, msg);
      },
    ],
    [
      'DELETE',
      /^\/channels\/(\d+)\/messages\/(\d+)$/,
      (m, _b, res) => {
        const list = messages.get(m[1] ?? '') ?? [];
        if (!list.some((x) => x.id === m[2])) return notFound(res);
        messages.set(
          m[1] ?? '',
          list.filter((x) => x.id !== m[2]),
        );
        return json(res, 204);
      },
    ],
    ['POST', /^\/channels\/(\d+)\/invites$/, (_m, _b, res) => json(res, 200, { code: 'moinmorni' })],
    [
      'POST',
      /^\/channels\/(\d+)\/threads$/,
      (m, b, res) => {
        const th = { ...(b as unknown as FChannel), id: next(), parent_id: m[1] ?? null, members: [] };
        guild.channels.set(th.id, th);
        json(res, 200, th);
      },
    ],
    [
      'PUT',
      /^\/channels\/(\d+)\/thread-members\/(\d+)$/,
      (m, _b, res) => {
        guild.channels.get(m[1] ?? '')?.members?.push(m[2] ?? '');
        json(res, 204);
      },
    ],
    [
      'GET',
      /^\/guilds\/(\d+)\/members\/(\d+)$/,
      (m, _b, res) => {
        const mem = guild.members.get(m[2] ?? '');
        return mem ? json(res, 200, { user: { id: m[2] }, ...mem }) : notFound(res);
      },
    ],
    [
      'PATCH',
      /^\/guilds\/(\d+)\/members\/(\d+)$/,
      (m, b, res) => {
        const mem = guild.members.get(m[2] ?? '');
        if (!mem) return notFound(res);
        // Stummschalten geht nur mit dem Recht und nur, solange jemand in einem Sprachkanal sitzt (wie Discord).
        if ('mute' in b && !permissions.muteMembers)
          return json(res, 403, { code: 50013, message: 'Missing Permissions' });
        if ('mute' in b && !mem.channel_id)
          return json(res, 400, { code: 40032, message: 'Target user is not connected to voice.' });
        if ('mute' in b) mem.mute = b['mute'] === true;
        if ('communication_disabled_until' in b)
          mem.communication_disabled_until = (b['communication_disabled_until'] as string | null) ?? null;
        return json(res, 200, mem);
      },
    ],
    [
      'PUT',
      /^\/guilds\/(\d+)\/members\/(\d+)\/roles\/(\d+)$/,
      (m, _b, res) => {
        const mem = guild.members.get(m[2] ?? '');
        if (!mem) return notFound(res);
        if ((guild.roles.get(m[3] ?? '')?.position ?? 0) >= botTop()) return missing(res);
        if (!mem.roles.includes(m[3] ?? '')) mem.roles.push(m[3] ?? '');
        return json(res, 204);
      },
    ],
    [
      'DELETE',
      /^\/guilds\/(\d+)\/members\/(\d+)\/roles\/(\d+)$/,
      (m, _b, res) => {
        const mem = guild.members.get(m[2] ?? '');
        if (!mem) return notFound(res);
        mem.roles = mem.roles.filter((r) => r !== m[3]);
        return json(res, 204);
      },
    ],
    [
      'PUT',
      /^\/guilds\/(\d+)\/bans\/(\d+)$/,
      (m, _b, res) => {
        guild.bans.add(m[2] ?? '');
        guild.members.delete(m[2] ?? '');
        json(res, 204);
      },
    ],
    [
      'DELETE',
      /^\/guilds\/(\d+)\/bans\/(\d+)$/,
      (m, _b, res) => {
        if (!guild.bans.delete(m[2] ?? '')) return notFound(res);
        return json(res, 204);
      },
    ],
    [
      'PUT',
      /^\/applications\/(\d+)\/guilds\/(\d+)\/commands$/,
      (_m, b, res) => {
        commands.splice(0, commands.length, ...(b as unknown as unknown[]));
        json(res, 200, commands);
      },
    ],
    // Direktnachricht: Kanal „8<Empfänger>“, Nachrichten landen wie in jedem Kanal in `messages`.
    [
      'POST',
      /^\/users\/@me\/channels$/,
      (_m, b, res) => json(res, 200, { id: `8${String(b['recipient_id'])}`, type: 1 }),
    ],
    [
      'POST',
      /^\/interactions\/(\w+)\/([\w-]+)\/callback$/,
      (m, b, res) => {
        replies.push({ id: m[1] ?? '', body: b as { type: number; data: Record<string, unknown> } });
        json(res, 204);
      },
    ],
  ];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const path = (req.url ?? '').replace(/^\/api\/v10/, '');
      const raw = Buffer.concat(chunks).toString();
      requests.push({ method: req.method ?? '', path: req.url ?? '', body: raw });
      // Bilder-Server: /icons/<server>/<hash>.png, /banners/…, /avatars/…, /role-icons/<rolle>/<hash>.png
      const picture = /^\/(icons|banners|avatars|role-icons)\/\d+\/([\w]+)\.(png|gif)/.exec(path);
      if (req.method === 'GET' && picture) {
        const image = images.get(picture[2] ?? '');
        if (!image) return notFound(res);
        res.writeHead(200, { 'content-type': image.mime, 'access-control-allow-origin': '*' });
        res.end(image.bytes);
        return undefined;
      }
      // „Mit Discord anmelden“ (Webseite): Code gegen Schlüssel tauschen, dann „wer bin ich“.
      if (req.method === 'POST' && path === '/oauth2/token') {
        const form = new URLSearchParams(raw);
        if (form.get('grant_type') === 'client_credentials') {
          const basic = Buffer.from(
            (req.headers.authorization ?? '').replace('Basic ', ''),
            'base64',
          ).toString();
          return basic === `${bots.main.appId}:${FAKE_CLIENT_SECRET}`
            ? json(res, 200, { access_token: 'owner-token', token_type: 'Bearer' })
            : json(res, 401, { error: 'invalid_client' });
        }
        return form.get('code') === 'good-code' && form.get('client_secret') === FAKE_CLIENT_SECRET
          ? json(res, 200, { access_token: 'user-token', token_type: 'Bearer' })
          : json(res, 400, { error: 'invalid_grant' });
      }
      if (req.method === 'GET' && path === '/users/@me' && req.headers.authorization === 'Bearer user-token')
        return json(res, 200, { id: '5555', username: 'lena_dc', global_name: 'Lena' });
      const bot = [bots.main, bots.other].find((b) => req.headers.authorization === `Bot ${b.token}`);
      if (!bot) return json(res, 401, { code: 0, message: '401: Unauthorized' });
      const limit = limits.find((l) => l.method === req.method && l.path.test(path) && l.times > 0);
      if (limit) {
        limit.times -= 1;
        return json(res, 429, {
          message: 'You are being rate limited.',
          retry_after: limit.retryAfter,
          global: false,
        });
      }
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const route = routes.find(([method, re]) => method === req.method && re.test(path));
      if (!route) return json(res, 404, { code: 0, message: `fake: ${req.method} ${path}` });
      return route[2](path.match(route[1]) ?? ([] as unknown as RegExpMatchArray), body, res, bot);
    });
  });
  const wss = new WebSocketServer({ server });
  const send = (ws: WebSocket, msg: unknown): void => ws.send(JSON.stringify(msg));
  wss.on('connection', (ws) => {
    sockets.add(ws);
    send(ws, { op: 10, d: { heartbeat_interval: 45_000 }, s: null, t: null });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as { op: number; d?: { token?: string } };
      if (msg.op === 2) {
        const bot = [bots.main, bots.other].find((b) => b.token === msg.d?.token) ?? bots.main;
        state.identified += 1;
        state.seq += 1;
        send(ws, {
          op: 0,
          t: 'READY',
          s: state.seq,
          d: {
            session_id: 'sess',
            resume_gateway_url: `ws://127.0.0.1:${port()}`,
            user: { id: bot.userId, username: bot.username },
            application: { id: bot.appId },
          },
        });
        state.seq += 1;
        send(ws, { op: 0, t: 'GUILD_CREATE', s: state.seq, d: { id: guild.id, name: guild.name } });
      }
      if (msg.op === 1) send(ws, { op: 11, d: null, s: null, t: null });
    });
    ws.on('close', () => sockets.delete(ws));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  function port(): number {
    return (server.address() as AddressInfo).port;
  }

  return {
    api: `http://127.0.0.1:${port()}/api/v10`,
    cdn: `http://127.0.0.1:${port()}`,
    guild,
    permissions,
    messages,
    commands,
    replies,
    requests,
    bots,
    identified: () => state.identified,
    dispatch: (t, d) => {
      state.seq += 1;
      sockets.forEach((ws) => send(ws, { op: 0, t, s: state.seq, d }));
    },
    setBotPermissions: (bits) => {
      botRole().permissions = bits.toString();
    },
    limit: (method, path, times, retryAfter) => {
      limits.push({ method, path, times, retryAfter });
    },
    botRole,
    close: async () => {
      sockets.forEach((ws) => ws.terminate());
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
