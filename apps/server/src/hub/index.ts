import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { LAUNCHPADS, LOBBY_SPAWN_VIEW, PARKOUR, TOUR, modeIcon } from '@moinmorni/builder';
import type { GameRight, Role } from '@moinmorni/shared';
import type { Db } from '../db/index.js';
import type { EventBus } from '../lib/events.js';
import type { Stores } from '../panel/stores.js';
import { createChat, type ChatSettings } from './chat.js';
import { allowed, createCommands, findCommand, type Actor, type Command } from './commands.js';
import { hasRight, type HubContext } from './context.js';
import { createModeration, type Moderation } from './moderation.js';
import { createPlayerService, normalUuid, type PlayerService } from './players.js';
import { createPresence, type Presence } from './presence.js';
import { hubSecretOf, serverKeyOf } from './protocol.js';
import { createPunishService, type PunishService } from './punish.js';
import { createSettingCommands, mergeCommands } from './setting-commands.js';
import { createSocial } from './social.js';
import { createVoice } from './voice.js';
import { dateText, langOfLocale, mm, text, type Lang } from './texts.js';
import { createTransport, type Body, type Connection } from './transport.js';

/**
 * Der Hub: verbindet Proxy und Spielserver mit MoinMorni (docs/hub-protokoll.md). Hier laufen Anmeldung (Bann,
 * Wartung, voll), Anwesenheit, Chat, Befehle und Ränge zusammen.
 */

const MINUTE_MS = 60_000;
const NAME_MAX = 16;
const TEXT_MAX = 256;
const ARGS_MAX = 32;
const LANG_FALLBACK: Lang = 'de';

const uuidField = z.string().min(1).max(40);
const nameField = z
  .string()
  .min(1)
  .max(NAME_MAX + 1);
const onlineSchema = z.object({
  players: z
    .array(
      z.object({
        uuid: uuidField,
        name: nameField,
        server: z.string().nullable(),
        locale: z.string().max(20).nullable().optional(),
        bedrock: z.boolean(),
      }),
    )
    .max(10_000),
});
const loginSchema = z.object({
  id: z.number().int(),
  uuid: uuidField,
  name: nameField,
  locale: z.string().max(20).nullable().optional(),
  bedrock: z.boolean(),
});
const switchSchema = z.object({ uuid: uuidField, server: z.string().min(1).max(32) });
const leaveSchema = z.object({ uuid: uuidField });
const localeSchema = z.object({ uuid: uuidField, locale: z.string().max(20) });
const commandSchema = z.object({
  id: z.number().int(),
  uuid: uuidField,
  command: z.string().min(1).max(32),
  args: z.array(z.string().max(TEXT_MAX)).max(ARGS_MAX),
});
const chatSchema = z.object({ uuid: uuidField, text: z.string().min(1).max(TEXT_MAX) });
const voiceGroupSchema = z.object({ uuid: uuidField, group: z.string().max(40).nullable() });
const connectingSchema = z.object({
  id: z.number().int(),
  uuid: uuidField,
  server: z.string().min(1).max(32),
});
const playSchema = z.object({ uuid: uuidField, mode: z.string().min(1).max(32) });
/** Lobby-Zahlen höchstens so oft an die Server schicken (viele Wechsel auf einmal = eine Nachricht). */
const LOBBY_DEBOUNCE_MS = 1_000;
/** Name der Lobby im Netzwerk – nur sie bekommt die Lobby-Einstellungen. */
const LOBBY_SERVER = 'lobby';
/** So lange darf ein Modus zum Aufwachen brauchen, dann gibt es eine Meldung. */
const WAKE_TIMEOUT_MS = 180_000;

export interface HubOptions {
  readonly secret: string;
  readonly db: Db;
  readonly stores: Stores;
  readonly events: EventBus;
  readonly log: FastifyBaseLogger;
  readonly timeZone: string;
  /** Öffentliche Adresse für Links (moinmorni.net). */
  readonly domain?: string;
  readonly now?: () => number;
  /** Weitere Befehle im Spiel (z. B. /discord vom Discord-Bot). */
  readonly extraCommands?: (ctx: HubContext) => Command[];
  /** Schlafenden Server wecken (Motor starten); false = ging nicht. */
  readonly wake?: (server: string) => Promise<boolean>;
}

export interface Hub {
  readonly listen: (host: string, port: number) => Promise<number>;
  readonly close: () => Promise<void>;
  /** Schlüssel für die hub.json eines Servers. */
  readonly keyFor: (server: string) => string;
  readonly presence: Presence;
  readonly players: PlayerService;
  readonly punish: PunishService;
  /** Strafen mit Rauswurf, Bann-Liste und Hinweis ans Team (auch fürs Panel). */
  readonly moderation: Moderation;
  /** Nachricht an einen Spieler, egal wo er ist (MiniMessage). */
  readonly tell: (uuid: string, text: string) => void;
  /** Rang eines Spielers hat sich geändert (Panel) → Spielserver informieren. */
  readonly refreshProfile: (uuid: string) => void;
  /** Ist der Proxy gerade mit dem Hub verbunden? */
  readonly proxyOnline: () => boolean;
  readonly connectedServers: () => string[];
}

export function createHub(options: HubOptions): Hub {
  const { db, stores, events, log } = options;
  const now = options.now ?? Date.now;
  const hubSecret = hubSecretOf(options.secret);
  const presence = createPresence(now);
  const players = createPlayerService(db, stores);
  const punish = createPunishService(db, () => new Date(now()));

  const conns = { proxy: null as Connection | null, backends: new Map<string, Connection>() };
  const toProxy = (body: Body): boolean => {
    conns.proxy?.send(body);
    return conns.proxy !== null;
  };
  const toBackend = (server: string, body: Body): void => conns.backends.get(server)?.send(body);

  const network = (): Body => {
    const s = stores.settings('network');
    const maintenance = s['maintenance'] === true;
    return {
      t: 'network',
      motd1: String(s['motd1'] ?? ''),
      motd2: maintenance
        ? `§6Wartung §8– §7${String(s['maintenanceMessage'] ?? '')}`
        : String(s['motd2'] ?? ''),
      maxPlayers: Number(s['maxPlayers']),
      maintenance,
    };
  };
  const defaultLang = (): Lang =>
    stores.settings('network')['defaultLanguage'] === 'en' ? 'en' : LANG_FALLBACK;
  const langOf = (uuid: string, locale: string | null | undefined): Lang => {
    const known = players.get(uuid);
    const stored = known?.language;
    if (stored === 'de' || stored === 'en') return stored;
    return langOfLocale(locale ?? known?.clientLocale, defaultLang());
  };
  const profile = (uuid: string): Body | null => {
    const p = presence.get(uuid);
    if (!p) return null;
    const role = players.roleOf(uuid);
    return {
      t: 'profile',
      uuid: p.uuid,
      name: p.name,
      lang: p.lang,
      role: {
        id: role.id,
        name: role.name[p.lang],
        symbol: role.symbol,
        colour: role.colour,
        position: role.position,
      },
    };
  };
  const sendProfile = (uuid: string): void => {
    const p = presence.get(uuid);
    const body = profile(uuid);
    if (p?.server && body) toBackend(p.server, body);
  };
  const bans = (): Body => ({ t: 'bans', list: punish.activeBans() });
  /** Rang/Sprache geändert: Spielserver und Discord ziehen nach. */
  const refresh = (uuid: string): void => {
    sendProfile(uuid);
    events.emit('player.changed', { uuid: normalUuid(uuid) });
  };

  const ctx: HubContext = {
    presence,
    players,
    punish,
    stores,
    timeZone: options.timeZone,
    domain: options.domain ?? 'moinmorni.net',
    msg: (uuid, line) => {
      if (toProxy({ t: 'msg', uuid, text: line })) return;
      const server = presence.get(uuid)?.server;
      if (server) toBackend(server, { t: 'msg', uuid, text: line });
    },
    kick: (uuid, line) => {
      toProxy({ t: 'kick', uuid, text: line });
    },
    connect: (uuid, server) => {
      if (!conns.backends.has(server) || !conns.proxy) return false;
      return toProxy({ t: 'connect', uuid, server });
    },
    chat: (servers, line) => {
      const targets = servers === 'all' ? [...conns.backends.values()] : [conns.backends.get(servers)];
      targets.forEach((c) => c?.send({ t: 'chat', text: line }));
    },
    team: (right: GameRight, build) =>
      presence
        .all()
        .filter((p) => hasRight(players.roleOf(p.uuid), right))
        .forEach((p) => ctx.msg(p.uuid, build(p.lang))),
    refreshProfile: refresh,
    syncBans: () => {
      toProxy(bans());
    },
  };
  const moderation = createModeration(ctx, (change) => events.emit('punishments.changed', change));
  const voiceRef: { broadcast: () => void } = { broadcast: () => undefined };
  const social = createSocial(ctx, db, now, () => voiceRef.broadcast());
  const voice = createVoice(
    ctx,
    () => [...conns.backends.values()],
    (server) => conns.backends.get(server),
    () => social.voiceGroups(),
  );
  voiceRef.broadcast = voice.broadcast;
  // Erst beim ersten Gebrauch zusammenstellen: Zusatzbefehle (Discord-Bot) gibt es erst nach dem Hub.
  const cache: { commands: Command[] | null } = { commands: null };
  const commands = (): Command[] => {
    cache.commands ??= mergeCommands(
      [
        ...createCommands(ctx, moderation),
        ...social.commands,
        ...voice.commands,
        ...(options.extraCommands?.(ctx) ?? []),
      ],
      createSettingCommands(ctx),
    );
    return cache.commands;
  };
  const chat = createChat(ctx, () => stores.settings('chat') as unknown as ChatSettings);

  /** Wer auf einen aufwachenden Server wartet: Server → Spieler. */
  const waiting = new Map<string, Set<string>>();
  const wakeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const modeName = (server: string, lang: Lang): string => {
    const mode = stores.modes().find((md) => md.server === server);
    return mode ? mode.name[lang] : server;
  };
  const wakeUp = (server: string): void => {
    if (!options.wake) return;
    const timer = setTimeout(() => {
      const list = waiting.get(server);
      waiting.delete(server);
      wakeTimers.delete(server);
      list?.forEach((uuid) => {
        const p = presence.get(uuid);
        if (p) ctx.msg(uuid, text(p.lang, 'mode.wake_failed', { mode: mm(modeName(server, p.lang)) }));
      });
    }, WAKE_TIMEOUT_MS);
    timer.unref();
    wakeTimers.set(server, timer);
    void options.wake(server).then(
      (ok) => {
        if (!ok) log.warn({ server }, 'Hub: Server ließ sich nicht wecken');
      },
      (err: unknown) => log.error({ err, server }, 'Hub: Wecken fehlgeschlagen'),
    );
  };
  /**
   * Darf der Spieler jetzt auf diesen Server? Geschlossen/bald/Wartung → Meldung. Schläft er, wird er geweckt und der
   * Spieler kommt danach von selbst hinein.
   */
  const admit = (uuid: string, server: string, lang: Lang): 'go' | 'stop' => {
    const mode = stores.modes().find((md) => md.server === server);
    const stop = (line: string): 'stop' => {
      ctx.msg(uuid, line);
      return 'stop';
    };
    const name = mm(modeName(server, lang));
    if (mode?.state === 'off') return stop(text(lang, 'mode.closed', { mode: name }));
    if (mode?.state === 'soon') return stop(text(lang, 'mode.soon', { mode: name }));
    if (mode?.state === 'maintenance' && !hasRight(players.roleOf(uuid), 'maintenance-join'))
      return stop(text(lang, 'mode.maintenance', { mode: name }));
    if (!mode || conns.backends.has(server) || !options.wake) return 'go';
    const list = waiting.get(server) ?? new Set<string>();
    const first = !waiting.has(server);
    list.add(uuid);
    waiting.set(server, list);
    if (first) wakeUp(server);
    return stop(text(lang, 'mode.waking', { mode: name }));
  };
  const connecting = (conn: Connection, body: unknown): void => {
    const m = connectingSchema.parse(body);
    const uuid = normalUuid(m.uuid);
    const lang: Lang = presence.get(uuid)?.lang ?? defaultLang();
    reply(conn, m.id, { allow: admit(uuid, m.server, lang) === 'go' });
  };
  /** Figur in der Lobby angeklickt: in den Modus (oder wecken, oder sagen, warum nicht). */
  const play = (conn: Connection, body: unknown): void => {
    if (conn.kind !== 'backend') return;
    const m = playSchema.parse(body);
    const uuid = normalUuid(m.uuid);
    const p = presence.get(uuid);
    const mode = stores.modes().find((md) => md.id === m.mode);
    if (!p || !mode) return;
    const name = mm(mode.name[p.lang]);
    if (!mode.server) {
      ctx.msg(uuid, text(p.lang, 'mode.soon', { mode: name }));
      return;
    }
    if (p.server === mode.server) {
      ctx.msg(uuid, text(p.lang, 'mode.already', { mode: name }));
      return;
    }
    if (admit(uuid, mode.server, p.lang) !== 'go') return;
    if (mode.access === 'whitelist') ctx.msg(uuid, text(p.lang, 'mode.invite_only', { mode: name }));
    ctx.msg(uuid, text(p.lang, 'mode.joining', { mode: name }));
    ctx.connect(uuid, mode.server);
  };

  /** Was die Figuren in der Lobby über ihren Modus zeigen: Name, Zustand, Spielerzahl, wach oder schlafend. */
  const lobbyState = (): Body => ({
    t: 'lobby',
    modes: [...stores.modes()]
      .sort((a, b) => a.position - b.position)
      .map((md) => ({
        id: md.id,
        name: md.name,
        state: md.state,
        access: md.access,
        max: md.maxPlayers,
        players: md.server ? presence.on(md.server).length : 0,
        hasServer: md.server !== null,
        awake: md.server !== null && conns.backends.has(md.server),
        icon: modeIcon(md.id),
      })),
  });
  /** Lobby-Einstellungen aus dem Panel + die festen Punkte der Lobby (Ankunft, Launchpads, Parkour, Rundgang). */
  const lobbySettings = (): Body => {
    const l = stores.settings('lobby');
    return {
      t: 'lobby-settings',
      welcome: { title: String(l['welcomeTitle'] ?? ''), subtitle: String(l['welcomeSubtitle'] ?? '') },
      tour: l['tourForNewPlayers'] === true,
      announcements: Array.isArray(l['announcements']) ? l['announcements'].map(String) : [],
      announcementSeconds: Number(l['announcementSeconds']),
      season: String(l['season'] ?? 'none'),
      launchpads: l['launchpads'] === true,
      parkour: l['parkour'] === true,
      walkers: Number(l['walkers']),
      features: { spawn: LOBBY_SPAWN_VIEW, launchpads: LAUNCHPADS, parkour: PARKOUR, tour: TOUR },
    };
  };
  let lobbyTimer: ReturnType<typeof setTimeout> | null = null;
  const lobbySoon = (): void => {
    if (lobbyTimer) return;
    lobbyTimer = setTimeout(() => {
      lobbyTimer = null;
      const body = lobbyState();
      conns.backends.forEach((c) => c.send(body));
    }, LOBBY_DEBOUNCE_MS);
    lobbyTimer.unref();
  };

  const reply = (conn: Connection, id: number, data: unknown): void =>
    conn.send({ t: 'reply', id, ok: true, data });
  const fail = (conn: Connection, id: number, error: string): void =>
    conn.send({ t: 'reply', id, ok: false, error });

  const leave = (uuid: string): void => {
    if (presence.get(uuid)) social.left(normalUuid(uuid));
    voice.onGroup(normalUuid(uuid), null);
    const gone = presence.leave(uuid);
    if (gone) players.addMinutes(gone.uuid, Math.round((now() - gone.since) / MINUTE_MS));
  };

  const login = (conn: Connection, body: unknown): void => {
    const m = loginSchema.parse(body);
    const uuid = normalUuid(m.uuid);
    players.seen({ uuid, name: m.name, bedrock: m.bedrock });
    const lang = langOf(uuid, m.locale);
    const role: Role = players.roleOf(uuid);
    const ban = punish.active(uuid, 'ban');
    const deny = (message: string): void => reply(conn, m.id, { allow: false, message });
    if (ban) {
      const until = ban.expiresAt
        ? text(lang, 'punish.until', { date: dateText(lang, ban.expiresAt, options.timeZone) })
        : text(lang, 'punish.forever');
      deny(text(lang, 'ban.screen', { reason: mm(ban.reason), until }));
      return;
    }
    const net = stores.settings('network');
    if (net['maintenance'] === true && !hasRight(role, 'maintenance-join')) {
      deny(text(lang, 'maintenance.screen', { message: mm(String(net['maintenanceMessage'] ?? '')) }));
      return;
    }
    const full = presence.all().filter((p) => p.uuid !== uuid).length >= Number(net['maxPlayers']);
    if (full && !hasRight(role, 'reserved-slot')) {
      deny(text(lang, 'full.screen'));
      return;
    }
    presence.join({ uuid, name: m.name, bedrock: m.bedrock, lang });
    reply(conn, m.id, { allow: true, lang });
  };

  const actorOf = (uuid: string): Actor | null => {
    const p = presence.get(uuid);
    return p ? { uuid: p.uuid, name: p.name, lang: p.lang, role: players.roleOf(p.uuid) } : null;
  };

  const handlers: Readonly<Record<string, (conn: Connection, body: Body) => void>> = {
    online: (_conn, body) => {
      const list = onlineSchema.parse(body).players;
      const seen = new Set(list.map((p) => normalUuid(p.uuid)));
      presence
        .all()
        .filter((p) => !seen.has(p.uuid))
        .forEach((p) => leave(p.uuid));
      list.forEach((p) => {
        const uuid = normalUuid(p.uuid);
        players.seen({ uuid, name: p.name, bedrock: p.bedrock });
        presence.join({ uuid, name: p.name, bedrock: p.bedrock, lang: langOf(uuid, p.locale) });
        if (p.server) presence.move(uuid, p.server);
        sendProfile(uuid);
      });
      lobbySoon();
    },
    login,
    connecting,
    play,
    switch: (_conn, body) => {
      const m = switchSchema.parse(body);
      lobbySoon();
      const first = presence.get(m.uuid)?.server === null;
      presence.move(m.uuid, m.server);
      sendProfile(m.uuid);
      // Erst jetzt ist der Spieler wirklich da: Freunde erfahren es, offene Anfragen kommen an.
      if (first) social.joined(normalUuid(m.uuid));
      social.switched(normalUuid(m.uuid), m.server);
    },
    leave: (_conn, body) => {
      leave(leaveSchema.parse(body).uuid);
      lobbySoon();
    },
    // Die Sprache des Clients kommt erst nach der Anmeldung; wer sie selbst gewählt hat (/sprache), behält sie.
    locale: (_conn, body) => {
      const m = localeSchema.parse(body);
      players.setClientLocale(m.uuid, m.locale);
      const p = presence.get(m.uuid);
      const lang = langOf(m.uuid, m.locale);
      if (!p || p.lang === lang) return;
      p.lang = lang;
      sendProfile(p.uuid);
    },
    command: (conn, body) => {
      const m = commandSchema.parse(body);
      const actor = actorOf(m.uuid);
      const command = findCommand(commands(), m.command);
      if (!actor || !command) {
        fail(conn, m.id, 'unknown');
        return;
      }
      if (!allowed(command, actor.role)) ctx.msg(actor.uuid, text(actor.lang, 'cmd.no_right'));
      else command.run(actor, m.args);
      reply(conn, m.id, {});
    },
    complete: (conn, body) => {
      const m = commandSchema.parse(body);
      const actor = actorOf(m.uuid);
      const command = findCommand(commands(), m.command);
      const ok = actor && command && allowed(command, actor.role);
      reply(conn, m.id, { suggestions: ok && command.complete ? command.complete(actor, m.args) : [] });
    },
    'voice-group': (conn, body) => {
      if (conn.kind !== 'backend') return;
      const m = voiceGroupSchema.parse(body);
      voice.onGroup(normalUuid(m.uuid), m.group);
    },
    chat: (conn, body) => {
      if (conn.kind !== 'backend') return;
      const m = chatSchema.parse(body);
      chat.handle(normalUuid(m.uuid), m.text, now());
    },
  };

  const transport = createTransport(hubSecret, log, {
    onOpen: (conn) => {
      if (conn.kind === 'proxy') {
        conns.proxy = conn;
        conn.send({
          t: 'welcome',
          server: conn.server,
          kind: conn.kind,
          commands: commands().map((c) => ({ name: c.name, aliases: c.aliases })),
        });
        conn.send(network());
        conn.send(bans());
        return;
      }
      conns.backends.set(conn.server, conn);
      conn.send({ t: 'welcome', server: conn.server, kind: conn.kind });
      conn.send(voice.config());
      conn.send(lobbyState());
      if (conn.server === LOBBY_SERVER) conn.send(lobbySettings());
      lobbySoon();
      presence.on(conn.server).forEach((p) => sendProfile(p.uuid));
      // Aufgewacht: wer gewartet hat, kommt jetzt hinein.
      const list = waiting.get(conn.server);
      waiting.delete(conn.server);
      clearTimeout(wakeTimers.get(conn.server));
      wakeTimers.delete(conn.server);
      list?.forEach((uuid) => {
        const p = presence.get(uuid);
        if (!p) return;
        ctx.msg(uuid, text(p.lang, 'mode.ready', { mode: mm(modeName(conn.server, p.lang)) }));
        ctx.connect(uuid, conn.server);
      });
    },
    onMessage: (conn, body) => {
      const handler = Object.hasOwn(handlers, body.t) ? handlers[body.t] : undefined;
      if (handler) handler(conn, body);
      else log.warn({ server: conn.server, t: body.t }, 'Hub: unbekannte Nachricht');
    },
    onBinary: (conn, payload) => {
      if (conn.kind === 'backend') voice.onAudio(conn, payload);
    },
    onClose: (conn) => {
      if (conns.proxy === conn) conns.proxy = null;
      if (conns.backends.get(conn.server) === conn) {
        conns.backends.delete(conn.server);
        lobbySoon();
      }
    },
  });

  events.on('settings.changed', ({ area }) => {
    if (area === 'network') toProxy(network());
    if (area === 'lobby') toBackend(LOBBY_SERVER, lobbySettings());
    if (area === 'voice') voice.broadcast();
  });
  events.on('roles.changed', () => presence.all().forEach((p) => sendProfile(p.uuid)));
  events.on('modes.changed', lobbySoon);

  return {
    listen: transport.listen,
    close: transport.close,
    keyFor: (server) => serverKeyOf(hubSecret, server),
    presence,
    players,
    punish,
    moderation,
    tell: (uuid, line) => ctx.msg(normalUuid(uuid), line),
    refreshProfile: refresh,
    proxyOnline: () => conns.proxy !== null,
    connectedServers: () => [...conns.backends.keys()],
  };
}
