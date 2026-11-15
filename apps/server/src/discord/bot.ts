import crypto from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Mode, Role } from '@moinmorni/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { discordObjects, news } from '../db/schema.js';
import type { Command } from '../hub/commands.js';
import type { HubContext } from '../hub/context.js';
import type { Hub } from '../hub/index.js';
import { mm } from '../hub/texts.js';
import type { EventBus } from '../lib/events.js';
import type { Stores } from '../panel/stores.js';
import type { StatusService } from '../public/status.js';
import { createDiscordClient, DiscordError, type DiscordClient, type GatewayEvent } from './client.js';
import {
  CHANNEL_CATEGORY,
  colourInt,
  discordRoleName,
  EXTRA_ROLES,
  isTeam,
  layout,
  overwritesFor,
  rolePermissions,
  type Audience,
  type ExtraRole,
  type RoleIds,
} from './layout.js';
import { botLang, bt, RULES_TEXT, type BotLang } from './texts.js';
import { APPLY_BUTTON, APPLY_FORM, createApplicationBot } from './applications.js';
import type { ApplicationService } from '../mornicraft/applications.js';

/**
 * Der MoinMorni-Bot: richtet den Discord-Server ein (Rollen aus der Vorlage, Kanäle mit Rechten, Regeln, Hilfe mit
 * Ticket-Knopf), hält eine Status-Nachricht aktuell, verbindet Minecraft- und Discord-Konten, überträgt Ränge und
 * Strafen (Bann, Timeout/Stumm) und schreibt ins Team-Log. Ein Discord-Server: der, auf den Philip den Bot holt.
 */

const ADMINISTRATOR = '8';
const STATUS_MS = 60_000;
const CLEANUP_MS = 300_000;
const CODE_MINUTES = 10;
const MINUTE_MS = 60_000;
const SECOND_MS = 1000;
const TIMEOUT_MAX_MS = 28 * 24 * 60 * MINUTE_MS;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const EPHEMERAL = 64;
const REPLY = 4;
const INTERACTION_COMMAND = 2;
const INTERACTION_COMPONENT = 3;
const INTERACTION_MODAL = 5;
const BUTTON_SECONDARY = 2;
const ROW = 1;
const BUTTON = 2;
const BUTTON_PRIMARY = 1;
const BUTTON_DANGER = 4;
const PRIVATE_THREAD = 12;
const OPTION_STRING = 3;
const HTTP_NOT_FOUND = 404;
const EMERALD = 0x1fa463;
const GREY = 0x6b7280;
const TICKET_OPEN = 'mm:ticket:open';
const TICKET_CLOSE = 'mm:ticket:close';
const MODE_ICON: Readonly<Record<Mode['state'], string>> = {
  on: '🟢',
  off: '⚫',
  maintenance: '🛠',
  soon: '🕓',
};
const MODE_STATE: Readonly<Record<Mode['state'], 'modeOn' | 'modeOff' | 'modeMaintenance' | 'modeSoon'>> = {
  on: 'modeOn',
  off: 'modeOff',
  maintenance: 'modeMaintenance',
  soon: 'modeSoon',
};

interface DRole {
  readonly id: string;
  readonly name: string;
}
interface DChannel {
  readonly id: string;
  readonly name: string;
  readonly type: number;
}

export interface BotStatus {
  readonly configured: boolean;
  readonly connected: boolean;
  readonly error: string | null;
  readonly membersIntent: boolean;
  readonly inviteUrl: string | null;
  readonly guild: { readonly id: string; readonly name: string } | null;
  readonly setupDone: boolean;
}

export interface SetupReport {
  readonly roles: number;
  readonly channels: number;
  readonly community: 'ok' | 'failed';
}

export interface MoinMorniBot {
  readonly start: () => void;
  readonly stop: () => void;
  readonly status: () => Promise<BotStatus>;
  readonly setup: () => Promise<SetupReport>;
  /** In-game /discord (für die Hub-Befehle). */
  readonly commands: (ctx: HubContext) => Command[];
  /** Status-Nachricht jetzt aktualisieren (Tests). */
  readonly refreshStatus: () => Promise<void>;
  /** Abgelaufene Stumm-Rollen entfernen (läuft sonst alle 5 Minuten). */
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
  /** Bewerbungen für MorniCraft (Formular, Posten in #bewerbungen, Entscheiden per Knopf). */
  readonly applications?: ApplicationService;
  readonly db: Db;
  readonly stores: Stores;
  readonly hub: Hub;
  readonly events: EventBus;
  readonly status: StatusService;
  readonly log: FastifyBaseLogger;
  readonly fetchImpl?: typeof fetch;
}

export function createMoinMorniBot(deps: BotDeps): MoinMorniBot {
  const { config, db, stores, hub, events, log } = deps;
  const client: DiscordClient | null = config.discordToken
    ? createDiscordClient(config.discordToken, config.discordApi, log, deps.fetchImpl)
    : null;
  const codes = new Map<string, { uuid: string; until: number }>();
  const timers: Array<ReturnType<typeof setInterval>> = [];
  const app = { id: null as string | null };

  // ---------- gemerkte IDs ----------
  const get = (key: string): string | null =>
    db.select().from(discordObjects).where(eq(discordObjects.key, key)).get()?.discordId ?? null;
  const put = (key: string, id: string): void => {
    db.insert(discordObjects)
      .values({ key, discordId: id })
      .onConflictDoUpdate({
        target: discordObjects.key,
        set: { discordId: id, updatedAt: new Date().toISOString() },
      })
      .run();
  };
  const drop = (key: string): void => {
    db.delete(discordObjects).where(eq(discordObjects.key, key)).run();
  };
  const rest = <T>(method: string, path: string, body?: unknown, reason?: string): Promise<T> => {
    if (!client) return Promise.reject(new Error('discord_not_configured'));
    return client.rest<T>(method, path, body, reason);
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
  const guildId = (): string | null => get('guild');
  const appId = async (): Promise<string> => {
    if (app.id) return app.id;
    const me = await rest<{ id: string }>('GET', '/applications/@me');
    app.id = me.id;
    return me.id;
  };

  // ---------- Einrichtung ----------
  const templateRoles = (): Role[] => stores.roles().filter((r) => !r.fallback);

  const ensureRole = async (
    g: string,
    existing: readonly DRole[],
    key: string,
    body: { name: string; color: number; permissions: string; hoist: boolean; mentionable: boolean },
  ): Promise<string> => {
    const known = get(key);
    const found = existing.find((r) => r.id === known) ?? existing.find((r) => r.name === body.name);
    const role = found
      ? await rest<DRole>('PATCH', `/guilds/${g}/roles/${found.id}`, body, 'MoinMorni: Rolle aktualisieren')
      : await rest<DRole>('POST', `/guilds/${g}/roles`, body, 'MoinMorni: Rolle anlegen');
    put(key, role.id);
    return role.id;
  };

  const ensureChannel = async (
    g: string,
    existing: readonly DChannel[],
    key: string,
    body: Record<string, unknown> & { name: string; type: number },
  ): Promise<string> => {
    const known = get(key);
    const found =
      existing.find((c) => c.id === known) ??
      existing.find((c) => c.name === body.name && c.type === body.type);
    const channel = found
      ? await rest<DChannel>('PATCH', `/channels/${found.id}`, body, 'MoinMorni: Kanal aktualisieren')
      : await rest<DChannel>('POST', `/guilds/${g}/channels`, body, 'MoinMorni: Kanal anlegen');
    put(key, channel.id);
    return channel.id;
  };

  const ensureMessage = async (
    key: string,
    channel: string,
    body: Record<string, unknown>,
  ): Promise<void> => {
    const known = get(key);
    if (known) {
      try {
        await rest('PATCH', `/channels/${channel}/messages/${known}`, body);
        return;
      } catch (err) {
        if (!(err instanceof DiscordError && err.status === HTTP_NOT_FOUND)) throw err;
      }
    }
    const msg = await rest<{ id: string }>('POST', `/channels/${channel}/messages`, body);
    put(key, msg.id);
  };

  const audienceRoles = (a: Audience): string[] => {
    const wants: Readonly<Record<Audience, readonly string[]>> = {
      everyone: [],
      jail: [],
      team: ['team-area'],
      builder: ['builder-area', 'team-area'],
      media: ['media-area', 'team-area'],
      vip: ['vip-area', 'media-area', 'team-area'],
    };
    return templateRoles()
      .filter((r) => r.discord.some((d) => wants[a].includes(d)) || r.discord.includes('administrator'))
      .map((r) => get(`role:${r.id}`))
      .filter((id): id is string => Boolean(id));
  };

  const helpMessage = (): Record<string, unknown> => ({
    embeds: [
      {
        title: `${bt('de', 'helpTitle')} · ${bt('en', 'helpTitle')}`,
        description: `${bt('de', 'helpText')}\n\n*${bt('en', 'helpText')}*`,
        color: EMERALD,
      },
    ],
    components: [
      {
        type: ROW,
        components: [
          {
            type: BUTTON,
            style: BUTTON_PRIMARY,
            label: bt('de', 'ticketButton'),
            custom_id: TICKET_OPEN,
            emoji: { name: '🎫' },
          },
          ...(deps.applications
            ? [
                {
                  type: BUTTON,
                  style: BUTTON_SECONDARY,
                  label: bt('de', 'applyButton'),
                  custom_id: APPLY_BUTTON,
                  emoji: { name: '📝' },
                },
              ]
            : []),
        ],
      },
    ],
  });

  const slashCommands = [
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
      description: 'Für MorniCraft bewerben',
      description_localizations: { 'en-US': 'Apply for MorniCraft' },
    },
    {
      name: 'status',
      description: 'Wer gerade spielt',
      description_localizations: { 'en-US': 'Who is playing right now' },
    },
  ];

  const setup = async (): Promise<SetupReport> => {
    // Ohne Bot-Token zuerst das sagen – sonst hieße es „kein Server“, obwohl der Bot fehlt.
    if (!client) throw new Error('discord_not_configured');
    const g = guildId();
    if (!g) throw new Error('discord_no_guild');
    const roles = await rest<DRole[]>('GET', `/guilds/${g}/roles`);
    const template = templateRoles();
    await template.reduce(async (prev, r) => {
      await prev;
      await ensureRole(g, roles, `role:${r.id}`, {
        name: discordRoleName(r),
        color: colourInt(r.colour),
        permissions: rolePermissions(r),
        hoist: isTeam(r) || r.discord.includes('vip-area') || r.discord.includes('media-area'),
        mentionable: isTeam(r),
      });
    }, Promise.resolve());
    await EXTRA_ROLES.reduce(async (prev, r) => {
      await prev;
      await ensureRole(g, roles, `role:${r.key}`, {
        name: r.name,
        color: r.colour,
        permissions: '0',
        hoist: false,
        mentionable: false,
      });
    }, Promise.resolve());

    const ids: RoleIds = {
      everyone: g,
      audience: audienceRoles,
      team: audienceRoles('team'),
      muted: get('role:muted') ?? g,
      jail: get('role:jail') ?? g,
    };
    const channels = await rest<DChannel[]>('GET', `/guilds/${g}/channels`);
    const voice = (stores.settings('voice')['channels'] as string[] | undefined) ?? [];
    const cats = layout(voice);
    const count = await cats.reduce(async (prev, cat) => {
      const before = await prev;
      const parent = await ensureChannel(g, channels, `cat:${cat.key}`, {
        name: cat.name,
        type: CHANNEL_CATEGORY,
        permission_overwrites: overwritesFor(cat.audience, false, ids),
      });
      await cat.channels.reduce(async (p, ch) => {
        await p;
        await ensureChannel(g, channels, `ch:${ch.key}`, {
          name: ch.name,
          type: ch.type,
          parent_id: parent,
          ...(ch.topic ? { topic: ch.topic } : {}),
          permission_overwrites: overwritesFor(ch.audience, ch.readOnly ?? false, ids),
        });
      }, Promise.resolve());
      return before + 1 + cat.channels.length;
    }, Promise.resolve(0));

    const rules = get('ch:rules');
    const help = get('ch:help');
    if (rules) await ensureMessage('msg:rules', rules, { content: RULES_TEXT });
    const welcome = get('ch:welcome');
    if (welcome && !get('invite')) {
      const invite = await rest<{ code: string }>('POST', `/channels/${welcome}/invites`, {
        max_age: 0,
        max_uses: 0,
        unique: false,
      });
      put('invite', invite.code);
    }
    if (help) await ensureMessage('msg:help', help, helpMessage());
    await rest('PUT', `/applications/${await appId()}/guilds/${g}/commands`, slashCommands);
    await refreshStatus();

    const community = await (async (): Promise<'ok' | 'failed'> => {
      try {
        const guild = await rest<{ features: string[] }>('GET', `/guilds/${g}`);
        await rest('PATCH', `/guilds/${g}`, {
          verification_level: 1,
          explicit_content_filter: 2,
          features: [...new Set([...guild.features, 'COMMUNITY'])],
          rules_channel_id: rules,
          public_updates_channel_id: get('ch:teamlog'),
        });
        return 'ok';
      } catch (err) {
        log.warn({ err }, 'Discord: Community-Server ließ sich nicht einschalten');
        return 'failed';
      }
    })();
    put('setup', new Date().toISOString().slice(0, 10).replaceAll('-', ''));
    log.info({ guild: g, channels: count }, 'Discord: Server eingerichtet');
    return { roles: template.length + EXTRA_ROLES.length, channels: count, community };
  };

  // ---------- Status ----------
  async function refreshStatus(): Promise<void> {
    const channel = get('ch:status');
    if (!client || !channel) return;
    const s = await deps.status.status();
    const lang: BotLang = 'de';
    const lines = s.modes
      .filter((m) => m.state !== 'off' || m.players > 0)
      .map((m) => {
        const state = bt(lang, MODE_STATE[m.state]);
        const asleep = m.state === 'on' && !m.awake ? ` · ${bt(lang, 'modeAsleep')}` : '';
        const players = m.state === 'on' ? ` · ${m.players}/${m.maxPlayers}` : '';
        return `${MODE_ICON[m.state]} **${m.name.de}** – ${state}${players}${asleep}`;
      });
    const head = s.online
      ? bt(lang, 'statusOnline', { players: s.players, max: s.maxPlayers })
      : bt(lang, 'statusOffline');
    await ensureMessage('msg:status', channel, {
      embeds: [
        {
          title: bt(lang, 'statusTitle'),
          description: [head, '', ...lines].join('\n'),
          color: s.online ? EMERALD : GREY,
          footer: { text: bt(lang, 'statusFooter', { address: s.javaAddress, port: s.bedrockPort }) },
          timestamp: s.updatedAt,
        },
      ],
    });
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

  const syncRoles = async (uuid: string): Promise<void> => {
    const g = guildId();
    const player = hub.players.get(uuid);
    if (!g || !player?.discordId) return;
    const m = await member(g, player.discordId);
    if (!m) return;
    const role = hub.players.roleOf(uuid);
    const managed = templateRoles()
      .map((r) => get(`role:${r.id}`))
      .filter((id): id is string => Boolean(id));
    const wanted = new Set(
      [role.fallback ? null : get(`role:${role.id}`), get('role:linked')].filter((id): id is string =>
        Boolean(id),
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
    // Wer erst nach der Strafe sein Konto verbindet, bekommt die Gefängnis-Rolle trotzdem.
    const jail = get('role:jail');
    if (jail && hub.punish.active(uuid, 'jail') && !m.roles.includes(jail))
      await setExtra(uuid, 'jail', true, 'MoinMorni: Gefängnis');
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

  const log2team = async (line: string): Promise<void> => {
    const channel = get('ch:teamlog');
    if (channel)
      await rest('POST', `/channels/${channel}/messages`, { content: line, allowed_mentions: { parse: [] } });
  };

  const onPunishment = async (c: {
    uuid: string;
    kind: string;
    action: 'add' | 'lift';
    until: string | null;
    reason: string;
    by: string;
  }): Promise<void> => {
    const g = guildId();
    if (!client || !g) return;
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
        await log2team(bt('de', 'logBan', vars));
      },
      'ban:lift': async () => {
        if (discordId)
          await rest('DELETE', `/guilds/${g}/bans/${discordId}`, undefined, 'MoinMorni: entbannt').catch(
            () => undefined,
          );
        await log2team(bt('de', 'logLiftBan', vars));
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
        await log2team(bt('de', 'logMute', vars));
      },
      'mute:lift': async () => {
        if (discordId)
          await rest('PATCH', `/guilds/${g}/members/${discordId}`, {
            communication_disabled_until: null,
          }).catch(() => undefined);
        await setExtra(c.uuid, 'muted', false, 'MoinMorni: Stumm vorbei');
        await log2team(bt('de', 'logLiftMute', vars));
      },
      // Gefängnis: Rolle „⛓ Gefängnis“ – sieht dann nur noch den Gefängnis-Kanal.
      'jail:add': async () => {
        await setExtra(c.uuid, 'jail', true, `MoinMorni: ${c.reason}`);
        await log2team(bt('de', 'logJail', vars));
      },
      'jail:lift': async () => {
        await setExtra(c.uuid, 'jail', false, 'MoinMorni: Gefängnis vorbei');
        await log2team(bt('de', 'logLiftJail', vars));
      },
      'warn:add': () => log2team(bt('de', 'logWarn', vars)),
      'kick:add': () => log2team(bt('de', 'logKick', vars)),
    };
    await actions[`${c.kind}:${c.action}`]?.();
  };

  const NEWS_TEXT_MAX = 1500;
  const postNews = async (slug: string): Promise<void> => {
    const channel = get('ch:news');
    const row = db.select().from(news).where(eq(news.slug, slug)).get();
    if (!client || !channel || !row) return;
    const text = row.bodyDe.length > NEWS_TEXT_MAX ? `${row.bodyDe.slice(0, NEWS_TEXT_MAX)} …` : row.bodyDe;
    await rest('POST', `/channels/${channel}/messages`, {
      embeds: [
        {
          title: row.titleDe,
          description: text,
          url: `https://${config.domain}/news/${row.slug}`,
          color: EMERALD,
          timestamp: row.publishedAt,
          footer: { text: row.author },
        },
      ],
    });
  };

  /** Abgelaufene Stumm- und Gefängnis-Strafen: die Rolle in Discord wieder abnehmen. */
  const cleanup = async (): Promise<void> => {
    const expired = (extra: 'muted' | 'jail', kind: 'mute' | 'jail'): Promise<void>[] =>
      db
        .select()
        .from(discordObjects)
        .where(like(discordObjects.key, `${extra}:%`))
        .all()
        .map((row) => row.key.slice(extra.length + 1))
        .filter((uuid) => !hub.punish.active(uuid, kind))
        .map((uuid) => setExtra(uuid, extra, false, 'MoinMorni: Strafe vorbei'));
    await Promise.all([...expired('muted', 'mute'), ...expired('jail', 'jail')]);
  };

  // ---------- Verbinden ----------
  const newCode = (): string =>
    Array.from(crypto.randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length] ?? '').join(
      '',
    );

  const commands = (ctx: HubContext): Command[] => [
    {
      name: 'discord',
      aliases: ['dc', 'verbinden'],
      usage: { de: '/discord', en: '/discord' },
      run: (actor) => {
        if (!client || !guildId()) {
          ctx.msg(actor.uuid, bt(actor.lang, 'noBotGame'));
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
    const help = get('ch:help');
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
                help: help ? `<#${help}>` : '#hilfe',
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

  const ticket = async (d: Record<string, unknown>, lang: BotLang): Promise<void> => {
    const help = get('ch:help');
    const user = userOf(d);
    if (!help) return;
    const thread = await rest<{ id: string }>('POST', `/channels/${help}/threads`, {
      name: `Ticket – ${user.name}`.slice(0, 90),
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
            { type: BUTTON, style: BUTTON_DANGER, label: bt(lang, 'ticketClose'), custom_id: TICKET_CLOSE },
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

  const handle = async (e: GatewayEvent): Promise<void> => {
    const d = e.d;
    if (e.t === 'GUILD_CREATE') {
      if (!guildId()) {
        put('guild', String(d['id']));
        log.info({ guild: d['name'] }, 'Discord: Bot ist auf dem Server');
      } else if (String(d['id']) !== guildId()) {
        // Der Bot gehört zu genau einem Server – hat ihn jemand woanders eingeladen, geht er dort wieder.
        log.warn({ guild: d['name'] }, 'Discord: Bot wurde auf einen fremden Server eingeladen – verlässt ihn');
        await rest('DELETE', `/users/@me/guilds/${String(d['id'])}`);
      }
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
      ...(appBot ? { bewerben: () => appBot.open(d, lang) } : {}),
      verbinden: () => link(d, lang),
      hilfe: () => hilfe(d, lang),
      status: async () => {
        await refreshStatus();
        const channel = get('ch:status');
        await respond(d, { content: channel ? `<#${channel}>` : '—' });
      },
    };
    const buttons: Readonly<Record<string, () => Promise<void>>> = {
      [TICKET_OPEN]: () => ticket(d, lang),
      [TICKET_CLOSE]: () => closeTicket(d, lang),
      ...(appBot ? { [APPLY_BUTTON]: () => appBot.open(d, lang) } : {}),
    };
    const component = data.custom_id ?? '';
    if (type === INTERACTION_COMMAND) await commandsByName[data.name ?? '']?.();
    if (type === INTERACTION_COMPONENT) {
      const plain = buttons[component];
      if (plain) await plain();
      else await appBot?.button(d, lang, component);
    }
    if (type === INTERACTION_MODAL && component === APPLY_FORM) await appBot?.submit(d, lang);
  };

  return {
    start: () => {
      if (!client) return;
      client.connect((e) => {
        handle(e).catch((err: unknown) => log.warn({ err, t: e.t }, 'Discord: Ereignis fehlgeschlagen'));
      });
      events.on('punishments.changed', (c) => {
        onPunishment(c).catch((err: unknown) => log.warn({ err }, 'Discord: Strafe nicht übertragen'));
      });
      events.on('application.created', ({ id }) => {
        appBot?.posted(id).catch((err: unknown) => log.warn({ err }, 'Discord: Bewerbung nicht gepostet'));
      });
      events.on('application.decided', ({ id }) => {
        appBot
          ?.decided(id)
          .catch((err: unknown) => log.warn({ err }, 'Discord: Entscheidung nicht übertragen'));
      });
      events.on('news.published', ({ slug }) => {
        postNews(slug).catch((err: unknown) => log.warn({ err }, 'Discord: News nicht gepostet'));
      });
      events.on('player.changed', ({ uuid }) => {
        syncRoles(uuid).catch((err: unknown) => log.warn({ err }, 'Discord: Rang nicht übertragen'));
      });
      const statusTimer = setInterval(() => {
        refreshStatus().catch((err: unknown) => log.warn({ err }, 'Discord: Status nicht aktualisiert'));
      }, STATUS_MS);
      const cleanupTimer = setInterval(() => {
        cleanup().catch((err: unknown) => log.warn({ err }, 'Discord: Aufräumen fehlgeschlagen'));
      }, CLEANUP_MS);
      statusTimer.unref();
      cleanupTimer.unref();
      timers.push(statusTimer, cleanupTimer);
    },
    stop: () => {
      timers.forEach((t) => clearInterval(t));
      client?.close();
    },
    status: async () => {
      const state = client?.state() ?? { connected: false, membersIntent: false, error: null };
      const id = client ? await appId().catch(() => null) : null;
      const g = guildId();
      const guild =
        g && client
          ? await rest<{ id: string; name: string }>('GET', `/guilds/${g}`).catch(() => null)
          : null;
      return {
        configured: Boolean(client),
        connected: state.connected,
        error: state.error,
        membersIntent: state.membersIntent,
        inviteUrl: id
          ? `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands&permissions=${ADMINISTRATOR}`
          : null,
        guild: guild ? { id: guild.id, name: guild.name } : null,
        setupDone: Boolean(get('setup')),
      };
    },
    setup,
    commands,
    /** Zeile in den Team-Log-Kanal (z. B. „MoinMorni wurde aktualisiert“). */
    teamLog: async (line: string) => {
      if (client) await log2team(line);
    },
    applicationId: async () => {
      if (!client) return null;
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
