import crypto from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Role } from '@moinmorni/shared';
import type { TeamApplicationService } from '../applications/team.js';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { discordObjects, news } from '../db/schema.js';
import type { Command } from '../hub/commands.js';
import type { HubContext } from '../hub/context.js';
import type { Hub } from '../hub/index.js';
import { mm } from '../hub/texts.js';
import type { EventBus } from '../lib/events.js';
import type { ApplicationService } from '../mornicraft/applications.js';
import type { Stores } from '../panel/stores.js';
import { publicAuthor } from '../public/author.js';
import type { StatusService } from '../public/status.js';
import { createAppearance, type Appearance } from './appearance.js';
import { APPLY_BUTTON, APPLY_FORM, createApplicationBot } from './applications.js';
import { createDiscordClient, DiscordError, type DiscordClient, type GatewayEvent } from './client.js';
import type { DiscordCredentials, CredentialsView } from './credentials.js';
import { EXTRA_ROLES, invitePermissions, permNames, type ExtraRole, type PermName } from './layout.js';
import { CUSTOM_IDS, EMERALD, statusMessage, type BoardContext } from './messages.js';
import { createDiscordSetup, type SetupProgress, type SetupReport } from './setup.js';
import { createDiscordStore } from './store.js';
import { createTeamBot } from './team-apply.js';
import { botLang, bt, type BotLang } from './texts.js';

/**
 * Der MoinMorni-Bot: richtet den Discord-Server ein (discord/setup.ts), hält Status, Regeln, Stellen und Spielmodi
 * aktuell, verbindet Minecraft- und Discord-Konten, überträgt Ränge und Strafen (Bann, Timeout/Stumm, Gefängnis, Sprachchat-Stumm),
 * schreibt ins Team- und Strafen-Log, nimmt Bewerbungen an (Team und MorniCraft) und öffnet Tickets. Der Token kommt
 * aus der .env oder dem Panel (discord/credentials.ts); ändert er sich, verbindet sich der Bot sofort neu.
 * Ein Discord-Server: der, auf den Philip den Bot holt.
 */

const STATUS_MS = 60_000;
const CLEANUP_MS = 300_000;
const CODE_MINUTES = 10;
const MINUTE_MS = 60_000;
const SECOND_MS = 1000;
/** Länger als 28 Tage geht kein Timeout in Discord (dann die Rolle „Stumm“). */
const TIMEOUT_MAX_MS = 2_419_200_000;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const EPHEMERAL = 64;
const REPLY = 4;
const INTERACTION_COMMAND = 2;
const INTERACTION_COMPONENT = 3;
const INTERACTION_MODAL = 5;
const ROW = 1;
const BUTTON = 2;
const BUTTON_DANGER = 4;
const PRIVATE_THREAD = 12;
const OPTION_STRING = 3;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
/** Discord: „Missing Permissions“ – hier fehlt dem Bot „Mitglieder stummschalten“. */
const MISSING_PERMISSIONS = 50013;
/** Darf der Bot nicht stummschalten, versucht er es erst nach dieser Pause wieder (nicht bei jedem Kanalwechsel). */
const NO_RIGHT_PAUSE_MS = 10 * MINUTE_MS;
/** Gemerkt: wen der Bot im Sprachkanal stummgeschaltet hat (Schlüssel + UUID → Discord-ID). */
const VOICE_MUTE_KEY = 'voicemute:';
const HTTP_UNAUTHORIZED = 401;
// Einladung für einen Klick-Befehl im Spiel: "https://discord.gg/moinmorni" ja, "https://x.y/'a'" und "http://…" nein.
// https://regex101.com/?flavor=javascript&regex=%5Ehttps%3A%5C%2F%5C%2F%5B%5E%5Cs'%22%3C%3E%5D%2B%24&testString=https%3A%2F%2Fdiscord.gg%2Fmoinmorni
const SAFE_LINK = /^https:\/\/[^\s'"<>]+$/;
const NEWS_TEXT_MAX = 1500;
const THREAD_NAME_MAX = 90;
const SELF_CACHE_MS = 60_000;
const CHECK_TIMEOUT_MS = 15_000;

export interface BotStatus {
  readonly configured: boolean;
  readonly connected: boolean;
  readonly error: string | null;
  readonly membersIntent: boolean;
  /** Einladung mit genau den Rechten, die der Bot braucht. */
  readonly inviteUrl: string | null;
  /** Die Rechte, nach denen die Einladung fragt. */
  readonly permissions: readonly PermName[];
  readonly guild: { readonly id: string; readonly name: string } | null;
  readonly setupDone: boolean;
  /** Woher Token und Client-Secret kommen (nie der Wert). */
  readonly credentials: CredentialsView;
  /** Der Bot, wie Discord ihn kennt. */
  readonly bot: { readonly id: string; readonly name: string } | null;
  /** Für „Mit Discord anmelden“: diese Adresse kommt im Developer Portal unter OAuth2 → Redirects hinein. */
  readonly redirectUrl: string;
  readonly setup: SetupProgress;
}

export interface MoinMorniBot {
  readonly start: () => void;
  readonly stop: () => void;
  readonly status: () => Promise<BotStatus>;
  /** Ganze Einrichtung (wartet bis zum Ende). */
  readonly setup: () => Promise<SetupReport>;
  /** Einrichtung im Hintergrund starten (Panel), Fortschritt über `status().setup`. */
  readonly startSetup: () => SetupProgress;
  /** Token oder Client-Secret geändert: neu verbinden. */
  readonly reconnect: () => void;
  /** Bot-Token prüfen, ohne ihn zu speichern: wer ist der Bot? */
  readonly checkToken: (token: string) => Promise<{ readonly id: string; readonly name: string }>;
  /** Client-Secret prüfen (gehört es zu dieser Anwendung?). */
  readonly checkClientSecret: (secret: string) => Promise<boolean>;
  readonly appearance: Appearance;
  /** In-game /discord (für die Hub-Befehle). */
  readonly commands: (ctx: HubContext) => Command[];
  /** Status-Nachricht jetzt aktualisieren (Tests). */
  readonly refreshStatus: () => Promise<void>;
  /** Abgelaufene Stumm- und Gefängnis-Rollen entfernen (läuft sonst alle 5 Minuten). */
  readonly cleanup: () => Promise<void>;
  /** Einladung in den Discord (legt der Bot beim Einrichten an), sonst null. */
  readonly inviteUrl: () => string | null;
  /** Ein Ereignis vom Gateway verarbeiten (Tests rufen das direkt). */
  readonly handle: (e: GatewayEvent) => Promise<void>;
  /** Zeile in den Team-Log-Kanal (ohne Bot oder Kanal: nichts). */
  readonly teamLog: (line: string) => Promise<void>;
  /** ID der Discord-Anwendung (für „Mit Discord anmelden“); null ohne Bot. */
  readonly applicationId: () => Promise<string | null>;
}

export interface BotDeps {
  readonly config: Config;
  readonly credentials: DiscordCredentials;
  /** Bewerbungen für MorniCraft (Formular, Posten in #bewerbungs-eingang, Entscheiden per Knopf). */
  readonly applications?: ApplicationService;
  /** Bewerbungen ins Team. */
  readonly team?: TeamApplicationService;
  readonly db: Db;
  readonly stores: Stores;
  readonly hub: Hub;
  readonly events: EventBus;
  readonly status: StatusService;
  readonly log: FastifyBaseLogger;
  readonly fetchImpl?: typeof fetch;
}

const NO_CLIENT = new Error('discord_not_configured');

export function createMoinMorniBot(deps: BotDeps): MoinMorniBot {
  const { config, db, stores, hub, events, log } = deps;
  const store = createDiscordStore(db);
  const codes = new Map<string, { uuid: string; until: number }>();
  const timers: Array<ReturnType<typeof setInterval>> = [];
  const live: {
    client: DiscordClient | null;
    token: string | null;
    started: boolean;
    appId: string | null;
    self: { id: string; name: string; at: number } | null;
    waits: Set<(ms: number) => void>;
    unhook: (() => void) | null;
  } = { client: null, token: null, started: false, appId: null, self: null, waits: new Set(), unhook: null };

  // ---------- Verbindung (Token aus .env oder Panel) ----------
  const clientFor = (token: string): DiscordClient =>
    createDiscordClient(token, config.discordApi, log, deps.fetchImpl);
  /** Der aktuelle Client – passt nicht mehr zum gespeicherten Token, wird er ersetzt. */
  const client = (): DiscordClient | null => {
    const token = deps.credentials.token();
    if (token === live.token) return live.client;
    live.client?.close();
    live.unhook?.();
    live.client = token ? clientFor(token) : null;
    live.unhook = live.client ? live.client.onWait((ms) => live.waits.forEach((w) => w(ms))) : null;
    live.token = token;
    live.appId = null;
    live.self = null;
    if (live.started && live.client) connect(live.client);
    return live.client;
  };
  const rest = <T>(method: string, path: string, body?: unknown, reason?: string): Promise<T> => {
    const c = client();
    if (!c) return Promise.reject(NO_CLIENT);
    return c.rest<T>(method, path, body, reason);
  };
  const get = store.get;
  const put = (key: string, id: string): void => store.put(key, id);
  const drop = store.drop;
  const guildId = (): string | null => get('guild');
  const appId = async (): Promise<string> => {
    if (live.appId) return live.appId;
    const me = await rest<{ id: string }>('GET', '/applications/@me');
    live.appId = me.id;
    return me.id;
  };
  const self = async (): Promise<{ id: string; name: string }> => {
    if (live.self && Date.now() - live.self.at < SELF_CACHE_MS) return live.self;
    const me = await rest<{ id: string; username: string }>('GET', '/users/@me');
    live.self = { id: me.id, name: me.username, at: Date.now() };
    return live.self;
  };

  const appBot = deps.applications
    ? createApplicationBot({
        rest,
        channel: (key) => get(`ch:${key}`),
        applications: deps.applications,
        hub,
        domain: config.domain,
        log,
      })
    : null;
  const teamBot = deps.team
    ? createTeamBot({
        rest,
        channel: (key) => get(`ch:${key}`),
        team: deps.team,
        hub,
        mornicraft: appBot ? (d, lang) => appBot.open(d, lang) : null,
        mornicraftOpen: () => deps.applications?.open() ?? false,
        domain: config.domain,
        log,
        onPosted: (id, messageId) => deps.applications?.setDiscordMessage(id, messageId),
      })
    : null;

  const templateRoles = (): Role[] => stores.roles().filter((r) => !r.fallback);
  const appearance = createAppearance({
    rest,
    store,
    guildId,
    cdn: config.discordCdn,
    log,
  });

  // ---------- Nachrichten und Einrichtung ----------
  const board = async (): Promise<BoardContext> => {
    const s = stores.settings('website');
    const lines = (v: unknown): string[] =>
      String(v ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    return {
      domain: config.domain,
      status: await deps.status.status(),
      channel: (key) => get(`ch:${key}`),
      rules: { de: lines(s['rulesDe']), en: lines(s['rulesEn']) },
      modes: stores.modes(),
      positions: deps.team?.positions().filter((p) => p.open) ?? [],
      mornicraftOpen: deps.applications?.open() ?? false,
    };
  };

  const slashCommands = (): unknown[] => [
    {
      name: 'verbinden',
      description: 'Minecraft-Konto verbinden – Code bekommst du im Spiel mit /discord',
      description_localizations: {
        'en-US': 'Link your Minecraft account – get the code in game with /discord',
      },
      options: [{ type: OPTION_STRING, name: 'code', description: 'Code aus dem Spiel', required: true }],
    },
    {
      name: 'hilfe',
      description: 'So geht MoinMorni',
      description_localizations: { 'en-US': 'How MoinMorni works' },
    },
    {
      name: 'bewerben',
      description: bt('de', 'commandApply'),
      description_localizations: { 'en-US': bt('en', 'commandApply') },
    },
    {
      name: 'status',
      description: 'Wer gerade spielt',
      description_localizations: { 'en-US': 'Who is playing right now' },
    },
  ];

  const setupRunner = createDiscordSetup({
    rest,
    store,
    stores,
    guildId,
    botUserId: async () => (await self()).id,
    commands: async () => ({ appId: await appId(), list: slashCommands() }),
    board,
    appearance,
    onWait: (listener) => {
      live.waits.add(listener);
      return () => live.waits.delete(listener);
    },
    log,
  });

  // ---------- Status ----------
  async function refreshStatus(): Promise<void> {
    const channel = get('ch:status');
    const key = 'msg:status';
    const known = store.entry(key);
    if (!client() || !channel) return;
    const body = statusMessage(await deps.status.status());
    if (known) {
      try {
        await rest('PATCH', `/channels/${channel}/messages/${known.id}`, body);
        return;
      } catch (err) {
        if (!(err instanceof DiscordError && err.status === HTTP_NOT_FOUND)) throw err;
      }
    }
    const msg = await rest<{ id: string }>('POST', `/channels/${channel}/messages`, body);
    store.put(key, msg.id, { created: true, applied: { channel } });
  }

  // ---------- Ränge und Strafen ----------
  const member = async (g: string, discordId: string): Promise<{ roles: string[] } | null> => {
    try {
      return await rest<{ roles: string[] }>('GET', `/guilds/${g}/members/${discordId}`);
    } catch (err) {
      if (err instanceof DiscordError && err.status === HTTP_NOT_FOUND) return null;
      throw err;
    }
  };

  /**
   * Rollen eines verbundenen Spielers: sein Rang + „Verbunden“. Im Gefängnis nur die Gefängnis-Rolle – dann sieht er
   * auch wirklich nur den Gefängnis-Kanal (Rechte anderer Rollen würden sonst dazukommen). Danach kommt alles zurück.
   */
  const syncRoles = async (uuid: string): Promise<void> => {
    const g = guildId();
    const player = hub.players.get(uuid);
    if (!g || !player?.discordId || !client()) return;
    const m = await member(g, player.discordId);
    if (!m) return;
    const role = hub.players.roleOf(uuid);
    const jailRole = get('role:jail');
    const jailed = Boolean(jailRole && hub.punish.active(uuid, 'jail'));
    const managed = [...templateRoles().map((r) => get(`role:${r.id}`)), get('role:linked'), jailRole].filter(
      (id): id is string => Boolean(id),
    );
    const wanted = new Set(
      (jailed ? [jailRole] : [role.fallback ? null : get(`role:${role.id}`), get('role:linked')]).filter(
        (id): id is string => Boolean(id),
      ),
    );
    const add = [...wanted].filter((id) => !m.roles.includes(id));
    const remove = m.roles.filter((id) => managed.includes(id) && !wanted.has(id));
    await Promise.all([
      ...add.map((id) =>
        rest('PUT', `/guilds/${g}/members/${player.discordId}/roles/${id}`, undefined, 'MoinMorni: Rang'),
      ),
      ...remove.map((id) =>
        rest('DELETE', `/guilds/${g}/members/${player.discordId}/roles/${id}`, undefined, 'MoinMorni: Rang'),
      ),
    ]);
    if (jailed) put(`jail:${uuid}`, player.discordId);
    else drop(`jail:${uuid}`);
    // Sprachchat-Stumm, falls die Person gerade in einem Sprachkanal sitzt (sonst beim nächsten Betreten).
    if (hub.punish.active(uuid, 'voice') && !get(`${VOICE_MUTE_KEY}${uuid}`))
      await setVoiceMute(uuid, true, 'MoinMorni: Sprachchat stumm');
  };

  const setExtra = async (uuid: string, extra: ExtraRole, on: boolean, reason: string): Promise<void> => {
    const g = guildId();
    const discordId = hub.players.get(uuid)?.discordId;
    const role = get(`role:${extra}`);
    if (!g || !discordId || !role) return;
    await rest(on ? 'PUT' : 'DELETE', `/guilds/${g}/members/${discordId}/roles/${role}`, undefined, reason);
    if (on) put(`${extra}:${uuid}`, discordId);
    else drop(`${extra}:${uuid}`);
  };

  /**
   * Sprachchat-Stumm in Discord: Server-Stummschaltung an oder aus. Geht nur, solange die Person in einem Sprachkanal
   * sitzt (sonst antwortet Discord 400 – dann beim nächsten Betreten, siehe VOICE_STATE_UPDATE) und der Bot
   * „Mitglieder stummschalten“ darf (sonst 403 – dann gilt die Strafe nur im Spiel, ohne Fehler). Gemerkt wird nur, wen
   * der Bot selbst stummgeschaltet hat; nur das hebt er wieder auf.
   */
  const voiceMute = { pausedUntil: 0 };
  const setVoiceMute = async (
    uuid: string,
    on: boolean,
    reason: string,
  ): Promise<'done' | 'not-in-voice' | 'no-right' | 'skipped'> => {
    const g = guildId();
    const discordId = hub.players.get(uuid)?.discordId;
    if (!client || !g || !discordId || (on && Date.now() < voiceMute.pausedUntil)) return 'skipped';
    try {
      await rest('PATCH', `/guilds/${g}/members/${discordId}`, { mute: on }, reason);
    } catch (err) {
      if (!(err instanceof DiscordError)) throw err;
      if (err.status === HTTP_FORBIDDEN || err.code === MISSING_PERMISSIONS) {
        voiceMute.pausedUntil = Date.now() + NO_RIGHT_PAUSE_MS;
        log.info('Discord: Der Bot darf niemanden stummschalten – Sprachchat-Stumm gilt nur im Spiel');
        return 'no-right';
      }
      if (err.status === HTTP_BAD_REQUEST) return 'not-in-voice';
      throw err;
    }
    if (on) put(`${VOICE_MUTE_KEY}${uuid}`, discordId);
    else drop(`${VOICE_MUTE_KEY}${uuid}`);
    return 'done';
  };

  /** Jemand betritt einen Sprachkanal oder ändert dort etwas: Sprachchat-Stumm nachziehen (an oder wieder aus). */
  const voiceStateChanged = async (d: Record<string, unknown>): Promise<void> => {
    if (d['channel_id'] === null || d['channel_id'] === undefined) return;
    const player = hub.players.byDiscord(String(d['user_id'] ?? ''));
    if (!player) return;
    const punished = hub.punish.active(player.uuid, 'voice') !== undefined;
    const muted = d['mute'] === true;
    if (punished && !muted) await setVoiceMute(player.uuid, true, 'MoinMorni: Sprachchat stumm');
    if (!punished && muted && get(`${VOICE_MUTE_KEY}${player.uuid}`))
      await setVoiceMute(player.uuid, false, 'MoinMorni: Sprachchat-Stumm vorbei');
  };

  const post = async (channelKey: string, line: string): Promise<void> => {
    const channel = get(`ch:${channelKey}`);
    if (channel)
      await rest('POST', `/channels/${channel}/messages`, { content: line, allowed_mentions: { parse: [] } });
  };
  const log2team = (line: string): Promise<void> => post('teamlog', line);
  /** Strafen haben einen eigenen Kanal; gibt es ihn (noch) nicht, landen sie im Team-Log. */
  const log2punish = (line: string): Promise<void> =>
    post(get('ch:punishlog') ? 'punishlog' : 'teamlog', line);

  const onPunishment = async (c: {
    uuid: string;
    kind: string;
    action: 'add' | 'lift';
    until: string | null;
    reason: string;
    by: string;
  }): Promise<void> => {
    const g = guildId();
    if (!client() || !g) return;
    const player = hub.players.get(c.uuid);
    const name = player?.name ?? c.uuid;
    const until = c.until ? bt('de', 'until', { ts: Math.floor(Date.parse(c.until) / SECOND_MS) }) : '';
    const vars = { name, by: c.by, reason: c.reason, until };
    const discordId = player?.discordId;
    const actions: Readonly<Record<string, () => Promise<void>>> = {
      'ban:add': async () => {
        if (discordId)
          await rest(
            'PUT',
            `/guilds/${g}/bans/${discordId}`,
            { delete_message_seconds: 0 },
            `MoinMorni: ${c.reason}`,
          );
        await log2punish(bt('de', 'logBan', vars));
      },
      'ban:lift': async () => {
        if (discordId)
          await rest('DELETE', `/guilds/${g}/bans/${discordId}`, undefined, 'MoinMorni: entbannt').catch(
            () => undefined,
          );
        await log2punish(bt('de', 'logLiftBan', vars));
      },
      'mute:add': async () => {
        const ms = c.until ? Date.parse(c.until) - Date.now() : Infinity;
        if (discordId && ms <= TIMEOUT_MAX_MS && c.until)
          await rest(
            'PATCH',
            `/guilds/${g}/members/${discordId}`,
            { communication_disabled_until: c.until },
            `MoinMorni: ${c.reason}`,
          );
        else await setExtra(c.uuid, 'muted', true, `MoinMorni: ${c.reason}`);
        await log2punish(bt('de', 'logMute', vars));
      },
      'mute:lift': async () => {
        if (discordId)
          await rest('PATCH', `/guilds/${g}/members/${discordId}`, {
            communication_disabled_until: null,
          }).catch(() => undefined);
        await setExtra(c.uuid, 'muted', false, 'MoinMorni: Stumm vorbei');
        await log2punish(bt('de', 'logLiftMute', vars));
      },
      // Gefängnis: nur noch die Rolle „⛓ Gefängnis“ – sieht dann nur den Gefängnis-Kanal; danach alles zurück.
      'jail:add': async () => {
        await syncRoles(c.uuid);
        await log2punish(bt('de', 'logJail', vars));
      },
      'jail:lift': async () => {
        await syncRoles(c.uuid);
        await log2punish(bt('de', 'logLiftJail', vars));
      },
      // Sprachchat-Stumm: im Discord-Sprachkanal stumm (Server-Stummschaltung), solange die Strafe läuft.
      'voice:add': async () => {
        const result = await setVoiceMute(c.uuid, true, `MoinMorni: ${c.reason}`).catch((err: unknown) => {
          log.warn({ err }, 'Discord: Sprachchat-Stumm nicht übertragen');
          return 'failed' as const;
        });
        const hint = result === 'no-right' ? bt('de', 'logVoiceNoRight') : '';
        await log2punish(`${bt('de', 'logVoiceMute', vars)}${hint}`);
      },
      'voice:lift': async () => {
        await setVoiceMute(c.uuid, false, 'MoinMorni: Sprachchat-Stumm aufgehoben').catch((err: unknown) => {
          log.warn({ err }, 'Discord: Sprachchat-Stumm nicht aufgehoben');
        });
        await log2punish(bt('de', 'logLiftVoiceMute', vars));
      },
      'warn:add': () => log2punish(bt('de', 'logWarn', vars)),
      'kick:add': () => log2punish(bt('de', 'logKick', vars)),
    };
    await actions[`${c.kind}:${c.action}`]?.();
  };

  const postNews = async (slug: string): Promise<void> => {
    const channel = get('ch:news');
    const row = db.select().from(news).where(eq(news.slug, slug)).get();
    if (!client() || !channel || !row) return;
    const text = row.bodyDe.length > NEWS_TEXT_MAX ? `${row.bodyDe.slice(0, NEWS_TEXT_MAX)} …` : row.bodyDe;
    await rest('POST', `/channels/${channel}/messages`, {
      embeds: [
        {
          title: row.titleDe,
          description: text,
          url: `https://${config.domain}/news/${row.slug}`,
          color: EMERALD,
          timestamp: row.publishedAt,
          footer: { text: publicAuthor(db, row.author) },
        },
      ],
    });
  };

  /**
   * Abgelaufene Stumm- und Gefängnis-Strafen: die Rolle in Discord wieder abnehmen (und die Ränge zurückgeben).
   * Sprachchat-Stumm: die Stummschaltung im Sprachkanal aufheben.
   */
  const cleanup = async (): Promise<void> => {
    const expired = (prefix: string, kind: 'mute' | 'jail' | 'voice'): string[] =>
      db
        .select()
        .from(discordObjects)
        .where(like(discordObjects.key, `${prefix}:%`))
        .all()
        .map((row) => row.key.slice(prefix.length + 1))
        .filter((uuid) => !hub.punish.active(uuid, kind));
    await Promise.all([
      ...expired('muted', 'mute').map((uuid) => setExtra(uuid, 'muted', false, 'MoinMorni: Strafe vorbei')),
      ...expired('jail', 'jail').map((uuid) => syncRoles(uuid)),
      // Sprachchat-Stumm vorbei: Stummschaltung aufheben (sitzt die Person nicht im Sprachkanal, beim nächsten Betreten).
      ...expired(VOICE_MUTE_KEY.slice(0, -1), 'voice').map(async (uuid) => {
        await setVoiceMute(uuid, false, 'MoinMorni: Strafe vorbei');
      }),
    ]);
  };

  // ---------- Verbinden ----------
  const newCode = (): string =>
    Array.from(crypto.randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length] ?? '').join(
      '',
    );

  /**
   * Einladung für den Chat im Spiel: die aus dem Panel (Webseite → Links), sonst die, die der Bot angelegt hat. Nur
   * https-Links ohne Leerzeichen, Anführungszeichen und spitze Klammern – der Link landet in einem Klick-Befehl.
   */
  const gameInvite = (): string | null => {
    const fromPanel = stores.settings('website')['discordInvite'];
    const code = get('invite');
    const link =
      typeof fromPanel === 'string' && fromPanel.trim()
        ? fromPanel.trim()
        : code
          ? `https://discord.gg/${code}`
          : '';
    return SAFE_LINK.test(link) ? link : null;
  };

  const commands = (ctx: HubContext): Command[] => [
    {
      name: 'discord',
      aliases: ['dc', 'verbinden'],
      usage: { de: '/discord', en: '/discord' },
      run: (actor) => {
        // Erst die Einladung (aus dem Panel, sonst die des Bots), dann – mit Bot – der Code zum Verbinden.
        const invite = gameInvite();
        if (invite) ctx.msg(actor.uuid, bt(actor.lang, 'inviteGame', { invite }));
        if (!client() || !guildId()) {
          if (!invite) ctx.msg(actor.uuid, bt(actor.lang, 'noBotGame'));
          return;
        }
        [...codes.entries()].filter(([, v]) => v.uuid === actor.uuid).forEach(([k]) => codes.delete(k));
        const code = newCode();
        codes.set(code, { uuid: actor.uuid, until: Date.now() + CODE_MINUTES * MINUTE_MS });
        ctx.msg(actor.uuid, bt(actor.lang, 'linkCodeGame', { code }));
      },
    },
  ];

  // ---------- Discord-Ereignisse ----------
  const respond = (d: Record<string, unknown>, data: Record<string, unknown>): Promise<unknown> =>
    rest('POST', `/interactions/${String(d['id'])}/${String(d['token'])}/callback`, {
      type: REPLY,
      data: { flags: EPHEMERAL, ...data },
    });

  const userOf = (d: Record<string, unknown>): { id: string; name: string } => {
    const user = ((d['member'] as { user?: unknown } | undefined)?.user ?? d['user']) as {
      id: string;
      username: string;
    };
    return { id: user.id, name: user.username };
  };

  const hilfe = async (d: Record<string, unknown>, lang: BotLang): Promise<void> => {
    const s = await deps.status.status();
    const where = get('ch:tickets') ?? get('ch:help');
    await respond(d, {
      embeds: [
        {
          title: bt(lang, 'hilfeTitle'),
          color: EMERALD,
          fields: [
            {
              name: bt(lang, 'hilfeJoin'),
              value: bt(lang, 'hilfeJoinText', { address: s.javaAddress, port: s.bedrockPort }),
            },
            { name: bt(lang, 'hilfeLink'), value: bt(lang, 'hilfeLinkText') },
            {
              name: bt(lang, 'hilfeHelp'),
              value: bt(lang, 'hilfeHelpText', {
                help: where ? `<#${where}>` : '#hilfe',
                web: `https://${config.domain}`,
              }),
            },
          ],
        },
      ],
    });
  };

  const link = async (d: Record<string, unknown>, lang: BotLang): Promise<void> => {
    const options = (d['data'] as { options?: Array<{ name: string; value: string }> }).options ?? [];
    const code = (options.find((o) => o.name === 'code')?.value ?? '').trim().toUpperCase();
    const entry = codes.get(code);
    if (!entry || entry.until < Date.now()) {
      await respond(d, { content: bt(lang, 'linkWrong') });
      return;
    }
    codes.delete(code);
    const user = userOf(d);
    hub.players.setDiscord(entry.uuid, user.id);
    await syncRoles(entry.uuid);
    const name = hub.players.get(entry.uuid)?.name ?? '?';
    await respond(d, { content: bt(lang, 'linkOk', { name }) });
    const online = hub.presence.get(entry.uuid);
    if (online) hub.tell(entry.uuid, bt(online.lang, 'linkDoneGame', { name: mm(user.name) }));
  };

  /** Ticket: privater Kanal (Thread) nur für die Person und das Team – im Ticket-Kanal, sonst in #hilfe. */
  const ticket = async (d: Record<string, unknown>, lang: BotLang): Promise<void> => {
    const parent = get('ch:tickets') ?? get('ch:help');
    const user = userOf(d);
    if (!parent) return;
    const thread = await rest<{ id: string }>('POST', `/channels/${parent}/threads`, {
      name: `Ticket – ${user.name}`.slice(0, THREAD_NAME_MAX),
      type: PRIVATE_THREAD,
      invitable: false,
    });
    await rest('PUT', `/channels/${thread.id}/thread-members/${user.id}`);
    const team = templateRoles()
      .filter((r) => r.discord.includes('tickets'))
      .map((r) => get(`role:${r.id}`))
      .filter((id): id is string => Boolean(id))
      .map((id) => `<@&${id}>`)
      .join(' ');
    await rest('POST', `/channels/${thread.id}/messages`, {
      content: bt(lang, 'ticketHello', { user: `<@${user.id}>`, team: team || 'das Team' }),
      components: [
        {
          type: ROW,
          components: [
            {
              type: BUTTON,
              style: BUTTON_DANGER,
              label: bt(lang, 'ticketClose'),
              custom_id: CUSTOM_IDS.ticketClose,
            },
          ],
        },
      ],
    });
    await respond(d, { content: bt(lang, 'ticketOpened', { channel: `<#${thread.id}>` }) });
  };

  const closeTicket = async (d: Record<string, unknown>, lang: BotLang): Promise<void> => {
    const channel = String(d['channel_id'] ?? '');
    const user = userOf(d);
    await respond(d, { content: bt(lang, 'ticketClosed', { user: user.name }) });
    await rest('POST', `/channels/${channel}/messages`, {
      content: bt(lang, 'ticketClosed', { user: `<@${user.id}>` }),
    });
    await rest('PATCH', `/channels/${channel}`, { archived: true, locked: true });
  };

  /** Bewerben: Auswahl (Team-Stellen + MorniCraft); ohne Team-Bewerbungen gleich das MorniCraft-Formular. */
  const apply = async (d: Record<string, unknown>, lang: BotLang): Promise<void> => {
    if (teamBot) await teamBot.pick(d, lang);
    else await appBot?.open(d, lang);
  };

  /** Neuer Bot (anderer Token, andere Anwendung): der alte Server gehört nicht automatisch dazu. */
  const ready = async (d: Record<string, unknown>): Promise<void> => {
    const application = (d['application'] as { id?: unknown } | undefined)?.id;
    const user = d['user'] as { id?: unknown; username?: unknown } | undefined;
    if (typeof user?.id === 'string')
      live.self = { id: user.id, name: String(user.username ?? ''), at: Date.now() };
    if (typeof application === 'string') {
      live.appId = application;
      const before = get('bot:app');
      if (before && before !== application) {
        log.info('Discord: anderer Bot – er verbindet sich mit dem Server, auf den du ihn holst');
        ['guild', 'invite', 'setup'].forEach(drop);
      }
      put('bot:app', application);
    }
    // Hat der Bot noch kein Profilbild, bekommt er einmal das MoinMorni-Logo (nicht bei jedem Start).
    await appearance.ensureBotLogo();
  };

  const handle = async (e: GatewayEvent): Promise<void> => {
    const d = e.d;
    if (e.t === 'READY') {
      await ready(d);
      return;
    }
    if (e.t === 'GUILD_CREATE') {
      if (!guildId()) {
        put('guild', String(d['id']));
        log.info({ guild: d['name'] }, 'Discord: Bot ist auf dem Server');
      } else if (String(d['id']) !== guildId()) {
        // Der Bot gehört zu genau einem Server – hat ihn jemand woanders eingeladen, geht er dort wieder.
        log.warn(
          { guild: d['name'] },
          'Discord: Bot wurde auf einen fremden Server eingeladen – verlässt ihn',
        );
        await rest('DELETE', `/users/@me/guilds/${String(d['id'])}`);
      }
      return;
    }
    if (e.t === 'VOICE_STATE_UPDATE' && String(d['guild_id']) === guildId()) {
      await voiceStateChanged(d);
      return;
    }
    if (e.t === 'GUILD_MEMBER_ADD' && String(d['guild_id']) === guildId()) {
      const user = d['user'] as { id: string };
      const linked = hub.players.byDiscord(user.id);
      if (linked) await syncRoles(linked.uuid);
      const welcome = get('ch:welcome');
      const s = await deps.status.status();
      if (welcome)
        await rest('POST', `/channels/${welcome}/messages`, {
          content: bt('de', 'welcome', {
            user: `<@${user.id}>`,
            address: s.javaAddress,
            port: s.bedrockPort,
          }),
          allowed_mentions: { users: [user.id] },
        });
      return;
    }
    if (e.t !== 'INTERACTION_CREATE') return;
    // Nur der eigene Server (und Direktnachrichten) – Knöpfe und Befehle von fremden Servern zählen nicht.
    if (d['guild_id'] !== undefined && String(d['guild_id']) !== guildId()) return;
    const lang = botLang(d['locale']);
    const data = (d['data'] ?? {}) as { name?: string; custom_id?: string };
    const type = Number(d['type']);
    const commandsByName: Readonly<Record<string, () => Promise<void>>> = {
      bewerben: () => apply(d, lang),
      verbinden: () => link(d, lang),
      hilfe: () => hilfe(d, lang),
      status: async () => {
        await refreshStatus();
        const channel = get('ch:status');
        await respond(d, { content: channel ? `<#${channel}>` : '—' });
      },
    };
    const buttons: Readonly<Record<string, () => Promise<void>>> = {
      [CUSTOM_IDS.ticketOpen]: () => ticket(d, lang),
      [CUSTOM_IDS.ticketClose]: () => closeTicket(d, lang),
      ...(appBot ? { [APPLY_BUTTON]: () => appBot.open(d, lang) } : {}),
    };
    const component = data.custom_id ?? '';
    if (type === INTERACTION_COMMAND) await commandsByName[data.name ?? '']?.();
    if (type === INTERACTION_COMPONENT) {
      const plain = buttons[component];
      if (plain) await plain();
      else if (!(await teamBot?.component(d, lang, component))) await appBot?.button(d, lang, component);
    }
    if (type === INTERACTION_MODAL) {
      if (component === APPLY_FORM) await appBot?.submit(d, lang);
      else await teamBot?.modal(d, lang, component);
    }
  };

  /** Im Hintergrund erledigen; geht etwas schief, steht es im Protokoll. */
  const background = (job: () => Promise<unknown> | undefined, what: string): void => {
    void (async () => {
      try {
        await job();
      } catch (err) {
        log.warn({ err }, what);
      }
    })();
  };

  const connect = (c: DiscordClient): void => {
    c.connect((e) => background(() => handle(e), `Discord: Ereignis ${e.t} fehlgeschlagen`));
  };

  /** Feste Nachrichten nachziehen, wenn sich im Panel etwas ändert (nur wenn eingerichtet). */
  const refresh = (which: Parameters<typeof setupRunner.refreshMessages>[0]): void => {
    if (!client()) return;
    background(() => setupRunner.refreshMessages(which), 'Discord: Nachricht nicht aktualisiert');
  };

  const inviteUrl = (id: string): string =>
    `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands&permissions=${invitePermissions(templateRoles()).toString()}&integration_type=0`;

  return {
    start: () => {
      if (live.started) return;
      live.started = true;
      // Gab es den Client schon (z. B. vom Panel gefragt), jetzt verbinden; ein neuer verbindet sich selbst.
      const before = live.client;
      const c = client();
      if (c && c === before) connect(c);
      events.on('punishments.changed', (c2) =>
        background(() => onPunishment(c2), 'Discord: Strafe nicht übertragen'),
      );
      events.on('application.created', ({ id }) => {
        const team = deps.team?.get(id);
        background(
          () => (team ? teamBot?.posted(team) : appBot?.posted(id)),
          'Discord: Bewerbung nicht gepostet',
        );
      });
      events.on('application.decided', ({ id, account }) => {
        const team = deps.team?.get(id);
        background(
          () => (team ? teamBot?.decided(team, account === true) : appBot?.decided(id)),
          'Discord: Entscheidung nicht übertragen',
        );
      });
      events.on('news.published', ({ slug }) =>
        background(() => postNews(slug), 'Discord: News nicht gepostet'),
      );
      events.on('player.changed', ({ uuid }) =>
        background(() => syncRoles(uuid), 'Discord: Rang nicht übertragen'),
      );
      events.on('settings.changed', ({ area }) => {
        const which: Readonly<Record<string, Parameters<typeof refresh>[0]>> = {
          website: 'rules',
          'team-apply': 'apply',
          mornicraft: 'apply',
        };
        const w = which[area];
        if (w) refresh(w);
      });
      events.on('modes.changed', () => refresh('modes'));
      events.on('roles.changed', () => refresh('apply'));
      const statusTimer = setInterval(
        () => background(refreshStatus, 'Discord: Status nicht aktualisiert'),
        STATUS_MS,
      );
      const cleanupTimer = setInterval(
        () => background(cleanup, 'Discord: Aufräumen fehlgeschlagen'),
        CLEANUP_MS,
      );
      statusTimer.unref();
      cleanupTimer.unref();
      timers.push(statusTimer, cleanupTimer);
    },
    stop: () => {
      timers.forEach((t) => clearInterval(t));
      live.started = false;
      live.client?.close();
    },
    reconnect: () => {
      // client() merkt den neuen Token und baut die Verbindung neu auf.
      live.token = null;
      live.client?.close();
      live.client = null;
      client();
    },
    status: async () => {
      const c = client();
      const state = c?.state() ?? { connected: false, membersIntent: false, error: null };
      const id = c ? await appId().catch(() => null) : null;
      const me = c ? await self().catch(() => null) : null;
      const g = guildId();
      const guild =
        g && c ? await rest<{ id: string; name: string }>('GET', `/guilds/${g}`).catch(() => null) : null;
      return {
        configured: Boolean(c),
        connected: state.connected,
        error: state.error,
        membersIntent: state.membersIntent,
        inviteUrl: id ? inviteUrl(id) : null,
        permissions: permNames(invitePermissions(templateRoles())),
        guild: guild ? { id: guild.id, name: guild.name } : null,
        setupDone: Boolean(get('setup')),
        credentials: deps.credentials.view(),
        bot: me ? { id: me.id, name: me.name } : null,
        redirectUrl: `https://${config.domain}/api/public/apply/callback`,
        setup: setupRunner.progress(),
      };
    },
    setup: async () => {
      // Ohne Bot-Token zuerst das sagen – sonst hieße es „kein Server“, obwohl der Bot fehlt.
      if (!client()) throw NO_CLIENT;
      if (!guildId()) throw new Error('discord_no_guild');
      return setupRunner.run();
    },
    startSetup: () => {
      if (!client()) throw NO_CLIENT;
      if (!guildId()) throw new Error('discord_no_guild');
      return setupRunner.start();
    },
    checkToken: async (token) => {
      const res = await (deps.fetchImpl ?? fetch)(`${config.discordApi}/users/@me`, {
        headers: {
          authorization: `Bot ${token}`,
          'user-agent': 'DiscordBot (https://moinmorni.net, 1.0) MoinMorni',
        },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      if (res.status === HTTP_UNAUTHORIZED) throw new Error('discord_token_invalid');
      if (!res.ok) throw new Error('discord_unreachable');
      const me = (await res.json()) as { id?: unknown; username?: unknown; bot?: unknown };
      if (me.bot !== true || typeof me.id !== 'string') throw new Error('discord_token_not_bot');
      return { id: me.id, name: String(me.username ?? '') };
    },
    checkClientSecret: async (secret) => {
      const id = await appId();
      const res = await (deps.fetchImpl ?? fetch)(`${config.discordApi}/oauth2/token`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'identify' }).toString(),
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      return res.ok;
    },
    appearance,
    commands,
    /** Zeile in den Team-Log-Kanal (z. B. „MoinMorni wurde aktualisiert“). */
    teamLog: async (line: string) => {
      if (client()) await log2team(line);
    },
    applicationId: async () => {
      if (!client()) return null;
      try {
        return await appId();
      } catch {
        return null;
      }
    },
    inviteUrl: () => {
      const code = get('invite');
      return code ? `https://discord.gg/${code}` : null;
    },
    refreshStatus,
    cleanup,
    handle,
  };
}

// Rollen, die der Bot neben den Rängen verwaltet (für Tests und Doku).
export const MANAGED_EXTRA_ROLES = EXTRA_ROLES.map((r) => r.key);
