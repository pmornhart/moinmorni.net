import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { JAIL, JUMP_AND_RUN, LAUNCHPADS, LOBBY_SPAWN_VIEW, TOUR, modeIcon } from '@moinmorni/builder';
import {
  alwaysIn,
  areaById,
  modePause,
  WARTUNG_SERVER,
  type GameRight,
  type Mode,
  type Role,
} from '@moinmorni/shared';
import type { Db } from '../db/index.js';
import type { EventBus } from '../lib/events.js';
import type { Stores } from '../panel/stores.js';
import { createChat, type ChatSettings } from './chat.js';
import { allowed, createCommands, findCommand, type Actor, type Command } from './commands.js';
import { hasRight, type HubContext } from './context.js';
import { createModeration, type Moderation } from './moderation.js';
import {
  modeAreaOfServer,
  modeSettingsBody,
  modeSettingsStateSchema,
  serverOfModeArea,
} from './mode-settings.js';
import {
  MODE_PLAYER_SCHEMAS,
  MORNICRAFT_AREAS,
  morniCraftServer,
  morniCraftSettings,
  saveModePlayer,
} from './mornicraft.js';
import { createPlayerService, normalUuid, type PlayerService } from './players.js';
import { createPresence, type Presence } from './presence.js';
import { hubSecretOf, serverKeyOf, type ServerKind } from './protocol.js';
import { createPunishService, type PunishService } from './punish.js';
import { createRejoin } from './rejoin.js';
import { createSettingCommands, mergeCommands } from './setting-commands.js';
import { createSocial } from './social.js';
import { createModeStats, statsSchema, type ModeStatsService } from './stats.js';
import { createStreamerCommand, createStreamers } from './streamer.js';
import { createMusic } from './music.js';
import { lobbyMusicBody } from '../lobby/music.js';
import { createVoice } from './voice.js';
import { createWartung, type Wartung } from './wartung.js';
import { dateText, langOfLocale, mm, text, type Lang } from './texts.js';
import { createTransport, type Body, type Connection } from './transport.js';

/**
 * Der Hub: verbindet Proxy und Spielserver mit MoinMorni (docs/hub-protokoll.md). Hier laufen Anmeldung (Bann,
 * Wartung, voll), Anwesenheit, Chat, Befehle und Ränge zusammen.
 */

/** Nachrichten, die nur der Proxy schicken darf (alles andere kommt von den Spielservern). */
const PROXY_ONLY: ReadonlySet<string> = new Set([
  'online',
  'login',
  'connecting',
  'switch',
  'leave',
  'locale',
  'command',
  'complete',
  'fallback',
  'pack',
]);
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
// Clan-Kürzel eines Modus (MorniCraft): "MC", "Ö1" – nur Buchstaben und Ziffern, Farbe "#rrggbb".
// https://regex101.com/?flavor=javascript&regex=%5E%5B%5Cp%7BL%7D%5Cp%7BN%7D%5D%7B1%2C6%7D%24&flags=u&testString=M%C3%961
const TAG_TEXT = /^[\p{L}\p{N}]{1,6}$/u;
// https://regex101.com/?flavor=javascript&regex=%5E%23%5B0-9a-fA-F%5D%7B6%7D%24&testString=%2334d399
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const chatSchema = z.object({
  uuid: uuidField,
  text: z.string().min(1).max(TEXT_MAX),
  /** Kürzel vor dem Namen, das der Modus-Server mitschickt (Clan in MorniCraft). */
  tag: z.object({ text: z.string().regex(TAG_TEXT), colour: z.string().regex(HEX_COLOUR) }).optional(),
});
const voiceGroupSchema = z.object({ uuid: uuidField, group: z.string().max(40).nullable() });
const connectingSchema = z.object({
  id: z.number().int(),
  uuid: uuidField,
  server: z.string().min(1).max(32),
  /** Der Proxy schickt den Spieler nach einem Rauswurf oder beim Ankommen dorthin (nicht der Spieler selbst). */
  fallback: z.boolean().optional(),
});
/** Rauswurf oder Verbinden gescheitert: wohin jetzt? (`tried` = schon gescheitert) */
const fallbackSchema = z.object({
  id: z.number().int(),
  uuid: uuidField,
  from: z.string().min(1).max(32),
  tried: z.array(z.string().max(32)).max(16),
});
const modePlayerSchema = z.object({
  mode: z.string().min(1).max(32),
  uuid: uuidField,
  data: z.record(z.string(), z.unknown()),
});
const playSchema = z.object({ uuid: uuidField, mode: z.string().min(1).max(32) });
const partyRequestSchema = z.object({ id: z.number().int(), uuid: uuidField });
const toLobbySchema = z.object({ uuid: uuidField });
const modeStateSchema = z.object({
  mode: z.string().min(1).max(32),
  state: z.string().min(1).max(32),
  players: z.number().int().min(0).max(10_000),
});
/** Lobby-Zahlen höchstens so oft an die Server schicken (viele Wechsel auf einmal = eine Nachricht). */
const LOBBY_DEBOUNCE_MS = 1_000;
/** Name der Lobby im Netzwerk – nur sie bekommt die Lobby-Einstellungen. */
const LOBBY_SERVER = 'lobby';
/** Unter diesem Namen stehen die Werte der Lobby (Jump and Run) in der Statistik. */
const LOBBY_STATS = 'lobby';
/** Ort für Sonnenauf- und -untergang in der Lobby: München (Breite, Länge in Grad). */
const CLOCK_LATITUDE = 48.137;
const CLOCK_LONGITUDE = 11.575;
const BUILD_SERVER = 'bau';
/** So oft bekommt die Lobby den Stand des Gefängnisses auch ohne Änderung. */
const JAIL_RESEND_MS = 60_000;
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
  /** Steht diese Person auf der Whitelist eines Modus „nur auf Einladung“? Ohne = niemand außer dem Team. */
  readonly allowedIn?: (mode: string, uuid: string, name: string) => boolean;
}

export interface Hub {
  readonly listen: (host: string, port: number) => Promise<number>;
  readonly close: () => Promise<void>;
  /** Schlüssel für die hub.json eines Servers. */
  readonly keyFor: (server: string, kind: ServerKind) => string;
  readonly presence: Presence;
  readonly players: PlayerService;
  readonly punish: PunishService;
  /** Strafen mit Rauswurf, Bann-Liste und Hinweis ans Team (auch fürs Panel). */
  readonly moderation: Moderation;
  /** Nachricht an einen Spieler, egal wo er ist (MiniMessage). */
  readonly tell: (uuid: string, text: string) => void;
  /** Spieler auf einen Server schicken (über den Proxy); false = Server nicht da oder Proxy weg. */
  readonly connect: (uuid: string, server: string) => boolean;
  /** Spieler mit einer Nachricht aus dem Netzwerk nehmen (MiniMessage). */
  readonly kick: (uuid: string, text: string) => void;
  /**
   * Leiste oben, die herunterzählt („… startet in {s} s neu“ – {s} zählt das Netzwerk-Plugin selbst). Ältere Plugins
   * kennen sie nicht und überhören sie – darum steht derselbe Hinweis immer auch im Chat.
   */
  readonly countdown: (uuid: string, text: string, seconds: number) => void;
  /** Rang eines Spielers hat sich geändert (Panel) → Spielserver informieren. */
  readonly refreshProfile: (uuid: string) => void;
  /** Ist der Proxy gerade mit dem Hub verbunden? */
  readonly proxyOnline: () => boolean;
  readonly connectedServers: () => string[];
  /** Statistiken der Spielmodi (Ranglisten für Webseite und Panel). */
  readonly stats: ModeStatsService;
  /** Was die Modus-Server zuletzt über sich gemeldet haben (Runde läuft, wartet …). */
  readonly modeStates: () => Record<string, ModeRun>;
  /** Spielmodi, die für neue Einstellungen auf einen Neustart warten (Kennungen wie "duels"). */
  readonly modeRestarts: () => string[];
  /** Server, auf denen gerade ein Platz freigehalten wird (Verbindung mitten im Spiel weg) – sie schlafen nicht. */
  readonly heldServers: () => string[];
  /** Wartungs-Lobby – für den Neustart nach einem Update (network/restart-now.ts). */
  readonly wartung: {
    /** Kann gerade jemand dort warten (Schalter an, Server hängt am Hub)? */
    readonly open: () => boolean;
    /** Spieler dorthin, solange die Lobby neu startet – zurück geht es von selbst. */
    readonly park: (uuid: string) => boolean;
    /** Hält die Wartung diesen Spieler fest (darf nicht in die Lobby)? */
    readonly parked: (uuid: string) => boolean;
  };
}

/** Zustand eines Spielmodus, wie sein Server ihn meldet. */
export interface ModeRun {
  /** z. B. "waiting", "starting", "running" – frei, der Modus entscheidet. */
  readonly state: string;
  readonly players: number;
  readonly at: number;
}

export function createHub(options: HubOptions): Hub {
  const { db, stores, events, log } = options;
  const now = options.now ?? Date.now;
  const hubSecret = hubSecretOf(options.secret);
  const presence = createPresence(now);
  const players = createPlayerService(db, stores);
  const punish = createPunishService(db, () => new Date(now()));
  const streamers = createStreamers(db, stores, players, options.domain ?? 'moinmorni.net');

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
        ? `§6Wartung${wartungRef.service?.untilMotd() ?? ''} §8– §7${String(s['maintenanceMessage'] ?? '')}`
        : String(s['motd2'] ?? ''),
      maxPlayers: Number(s['maxPlayers']),
      maintenance,
      // Gibt es die Wartungs-Lobby? (Der Proxy schickt ohne Hub dorthin, wenn die Lobby nicht geht.)
      wartung: s['maintenanceLobby'] !== false,
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
  // Erst nach dem Kontext angelegt (createMusic braucht ihn) – das Profil fragt über diesen Verweis.
  const musicRef: { profileOf: (uuid: string) => unknown } = { profileOf: () => undefined };
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
      /** Rechte im Spiel (das Plugin gibt z. B. auf dem Bau-Server Kreativ und WorldEdit). */
      rights: role.game,
      /** Streamer-Modus: an/aus und was verdeckt wird (das Plugin verdeckt beim Empfänger, zeigt ● LIVE). */
      streamer: streamers.active(p.uuid),
      /** Lobbymusik: an/aus, eigene Lautstärke, Lobby-Paket geladen, „weiter“ (hub/music.ts). */
      music: musicRef.profileOf(p.uuid),
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

  /** Gibt es erst nach dem Kontext (braucht `ctx`); bis dahin hält niemand an. */
  const wartungRef: { service: Wartung | null } = { service: null };
  const ctx: HubContext = {
    held: (uuid, lang) => wartungRef.service?.held(uuid, lang) ?? null,
    presence,
    players,
    punish,
    stores,
    timeZone: options.timeZone,
    domain: options.domain ?? 'moinmorni.net',
    msg: (uuid, line) => {
      // Streamer: IP-Adressen und eigene Adressen verdeckt das Plugin beim Ausliefern („•••“).
      const body: Body = streamers.parts(uuid).includes('ip')
        ? { t: 'msg', uuid, text: line, mask: true }
        : { t: 'msg', uuid, text: line };
      if (toProxy(body)) return;
      const server = presence.get(uuid)?.server;
      if (server) toBackend(server, body);
    },
    kick: (uuid, line) => {
      toProxy({ t: 'kick', uuid, text: line });
    },
    connect: (uuid, server) => {
      if (!conns.backends.has(server) || !conns.proxy) return false;
      return toProxy({ t: 'connect', uuid, server });
    },
    goTo: (uuid, server) => {
      const lang: Lang = presence.get(uuid)?.lang ?? defaultLang();
      return admit(uuid, server, lang) === 'go' && ctx.connect(uuid, server);
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
    streamer: (uuid) => streamers.parts(uuid),
  };
  /** Wer im Gefängnis sitzt (mit Ende und Grund) und wo die Zelle ist – für das Lobby-Plugin. */
  const jailState = (): Body => ({
    t: 'jail',
    cell: JAIL,
    players: punish
      .activeAll('jail')
      .map((p) => ({ uuid: p.playerUuid, until: p.expiresAt, reason: p.reason })),
  });
  const wartung = createWartung({
    ctx,
    now,
    connected: (server) => conns.backends.has(server),
    toWartung: (body) => toBackend(WARTUNG_SERVER, body),
  });
  wartungRef.service = wartung;
  wartung.start();
  const voiceRef: { broadcast: () => void } = { broadcast: () => undefined };
  const music = createMusic(ctx, db);
  musicRef.profileOf = music.profileOf;
  const moderation = createModeration(ctx, (change) => {
    if (change.kind === 'jail') {
      toBackend(LOBBY_SERVER, jailState());
      // Im Gefängnis gibt es kein „Zurück ins Spiel“.
      rejoin.refresh();
    }
    // Sprachchat-Stumm: jeder Spielserver hält Stumme selbst zurück und braucht die neue Liste.
    if (change.kind === 'voice') voiceRef.broadcast();
    events.emit('punishments.changed', change);
  });
  const social = createSocial(ctx, db, now, () => voiceRef.broadcast());
  const stats = createModeStats(db);
  const modeRuns = new Map<string, ModeRun>();
  /** Modus → Server, der für neue Einstellungen neu starten muss. */
  const restartPending = new Map<string, string>();
  const setRestart = (mode: string, server: string, needed: boolean): void => {
    if (needed === (restartPending.get(mode) === server)) return;
    if (needed) restartPending.set(mode, server);
    else restartPending.delete(mode);
    events.emit('mode.restart', { mode, server, needed });
  };
  /** Gehört dieser Server zu diesem Modus? Nur dann darf er für ihn sprechen. */
  const servesMode = (conn: Connection, modeId: string): boolean =>
    conn.kind === 'backend' && stores.modes().some((md) => md.id === modeId && md.server === conn.server);
  /** Die Lobby meldet Werte unter „lobby“ (Jump and Run) – nur sie selbst. */
  const lobbyStats = (conn: Connection, modeId: string): boolean =>
    conn.kind === 'backend' && conn.server === LOBBY_SERVER && modeId === LOBBY_STATS;
  const voice = createVoice(
    ctx,
    () => [...conns.backends.values()],
    (server) => conns.backends.get(server),
    () => social.voiceGroups(),
    now,
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
        ...rejoin.commands,
        createStreamerCommand(ctx, streamers, { now, changed: sendProfile }),
        ...music.commands,
        ...(options.extraCommands?.(ctx) ?? []),
      ],
      createSettingCommands(ctx),
    );
    return cache.commands;
  };
  const chat = createChat(ctx, () => stores.settings('chat') as unknown as ChatSettings);
  /** Mitten im Spiel: Nachfrage vor /lobby, „Zurück ins Spiel“ (rejoin.ts). */
  const rejoin = createRejoin({ ctx, send: toBackend, connected: (s) => conns.backends.has(s), log, now });

  /** Wer auf einen aufwachenden Server wartet: Server → Spieler. */
  const waiting = new Map<string, Set<string>>();
  const wakeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const modeName = (server: string, lang: Lang): string => {
    const mode = stores.modes().find((md) => md.server === server);
    if (server === BUILD_SERVER) return lang === 'en' ? 'Build server' : 'Bau-Server';
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
    // Wartung des Netzwerks: wer nicht immer hinein darf, wartet in der Wartungs-Lobby – nirgends sonst.
    const held = server === WARTUNG_SERVER ? null : wartung.held(uuid, lang);
    if (held) return stop(held);
    // Bau-Server: nur fürs Bauteam.
    if (server === BUILD_SERVER && !hasRight(players.roleOf(uuid), 'build'))
      return stop(text(lang, 'build.no_right'));
    // Eingesperrte dürfen in die Lobby (Zelle) – und in die Wartungs-Lobby, solange die Lobby nicht da ist.
    const jail =
      server === LOBBY_SERVER || server === WARTUNG_SERVER ? undefined : punish.active(uuid, 'jail');
    if (jail)
      return stop(
        text(lang, 'jail.blocked', {
          until: jail.expiresAt
            ? text(lang, 'punish.until', { date: dateText(lang, jail.expiresAt, ctx.timeZone) })
            : text(lang, 'punish.forever'),
        }),
      );
    // Geschlossen: Spieler bleiben draußen, das Team (darf auch bei Wartung rein) kommt zum Vorbereiten trotzdem hinein.
    if (mode?.state === 'off') {
      if (!hasRight(players.roleOf(uuid), 'maintenance-join'))
        return stop(text(lang, 'mode.closed', { mode: name }));
      ctx.msg(uuid, text(lang, 'mode.closed_team', { mode: name }));
    }
    if (mode?.state === 'soon') return stop(text(lang, 'mode.soon', { mode: name }));
    if (mode?.state === 'maintenance' && !alwaysIn(players.roleOf(uuid)))
      return stop(text(lang, 'mode.maintenance', { mode: name }));
    // Nur auf Einladung (MorniCraft): Whitelist – das Team kommt immer hinein (dieselbe Regel zeigt das Panel).
    if (
      mode?.access === 'whitelist' &&
      !alwaysIn(players.roleOf(uuid)) &&
      !(
        options.allowedIn?.(mode.id, uuid, presence.get(uuid)?.name ?? players.get(uuid)?.name ?? '') ?? false
      )
    )
      return stop(
        text(lang, 'mode.not_listed', { mode: name, url: mm(`https://${ctx.domain}/mornicraft/bewerben`) }),
      );
    const sleeps = mode !== undefined || server === BUILD_SERVER;
    if (!sleeps || conns.backends.has(server) || !options.wake) return 'go';
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
    const allow = admit(uuid, m.server, lang) === 'go';
    // Vom Proxy dorthin geschickt (Lobby weg, Wartung): wartet und kommt automatisch zurück.
    if (allow && m.server === WARTUNG_SERVER && m.fallback) wartung.waiting(uuid);
    // Wer in der Wartung gerade ankommt und woandershin will, landet in der Wartungs-Lobby.
    const redirect = !allow && wartung.parked(uuid) && wartung.open() ? WARTUNG_SERVER : undefined;
    if (redirect) wartung.waiting(uuid);
    reply(conn, m.id, { allow, ...(redirect ? { redirect } : {}) });
  };
  /** Rauswurf oder Verbinden gescheitert: erst die Lobby, dann die Wartungs-Lobby – nie Bau-Server oder Modi. */
  const fallback = (conn: Connection, body: unknown): void => {
    const m = fallbackSchema.parse(body);
    const uuid = normalUuid(m.uuid);
    const lang: Lang = presence.get(uuid)?.lang ?? defaultLang();
    reply(conn, m.id, wartung.fallback(uuid, lang, m.tried));
  };
  /** Figur in der Lobby angeklickt: in den Modus (oder wecken, oder sagen, warum nicht). */
  const play = (conn: Connection, body: unknown): void => {
    if (conn.kind !== 'backend') return;
    const m = playSchema.parse(body);
    const uuid = normalUuid(m.uuid);
    const p = presence.get(uuid);
    const mode = stores.modes().find((md) => md.id === m.mode);
    if (!p || !mode || p.server !== conn.server) return;
    const name = mm(mode.name[p.lang]);
    if (!mode.server) {
      ctx.msg(uuid, text(p.lang, 'mode.soon', { mode: name }));
      return;
    }
    if (p.server === mode.server) {
      ctx.msg(uuid, text(p.lang, 'mode.already', { mode: name }));
      return;
    }
    const pause = pauseOf(mode);
    // Gerade zu (nicht Sommerpause), z. B. während der Server beendet wird: nicht hin, sondern Bescheid sagen.
    if (pause === 'closed') {
      ctx.msg(uuid, text(p.lang, 'mode.closed', { mode: name }));
      return;
    }
    if (admit(uuid, mode.server, p.lang) !== 'go') return;
    if (mode.access === 'whitelist') ctx.msg(uuid, text(p.lang, 'mode.invite_only', { mode: name }));
    if (pause === 'summer') ctx.msg(uuid, text(p.lang, 'mode.pause', { mode: name }));
    ctx.msg(uuid, text(p.lang, 'mode.joining', { mode: name }));
    ctx.connect(uuid, mode.server);
  };

  /** Was der Modus gerade meldet – nur solange sein Server verbunden ist (schlafend meldet er nichts). */
  const phaseOf = (md: Mode): string | null =>
    md.server !== null && conns.backends.has(md.server) ? (modeRuns.get(md.id)?.state ?? null) : null;
  /** Sommerpause (Wintersport außerhalb der Saison), gerade geschlossen oder offen. */
  const pauseOf = (md: Mode): 'summer' | 'closed' | null =>
    modePause({
      id: md.id,
      state: md.state,
      server: md.server,
      awake: md.server !== null && conns.backends.has(md.server),
      phase: phaseOf(md),
    });
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
        // Was der Modus selbst meldet (nur wach); `pause` sagt dem Schild, ob Sommerpause oder gerade zu.
        phase: phaseOf(md),
        pause: pauseOf(md),
        icon: modeIcon(md.id),
      })),
  });
  /** Lobby-Einstellungen aus dem Panel + die festen Punkte der Lobby (Ankunft, Launchpads, Jump and Run, Rundgang). */
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
      jumpAndRun: { on: l['jumpAndRun'] === true, harderFrom: Number(l['jumpHarderFrom']) },
      doubleJump: { on: l['doubleJump'] === true, strength: Number(l['doubleJumpStrength']) },
      walkers: Number(l['walkers']),
      // Tageszeit: „real“ = Sonne und Mond wie heute in Bayern (Zeitzone des Netzwerks, Ort München)
      daytime: String(l['daytime'] ?? 'real'),
      clock: { timeZone: options.timeZone, latitude: CLOCK_LATITUDE, longitude: CLOCK_LONGITUDE },
      features: { spawn: LOBBY_SPAWN_VIEW, launchpads: LAUNCHPADS, jump: JUMP_AND_RUN, tour: TOUR },
    };
  };
  /** Einstellungen für den MorniCraft-Server (Panel → Einstellungen → MorniCraft, Regeln der Webseite). */
  const morniCraft = (): Body =>
    morniCraftSettings(stores, { domain: ctx.domain, timeZone: options.timeZone });
  let lobbyTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  // Gefängnis: die Lobby bekommt den Stand jede Minute noch einmal – geht eine Freilassung unterwegs verloren, kommt
  // trotzdem jeder heraus (das Lobby-Plugin setzt Freie, die noch in der Zelle stehen, an den Dorfplatz).
  const jailTimer = setInterval(() => toBackend(LOBBY_SERVER, jailState()), JAIL_RESEND_MS);
  jailTimer.unref();
  const lobbySoon = (): void => {
    if (lobbyTimer || closed) return;
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
    rejoin.left(uuid, presence.get(uuid)?.server ?? null);
    if (presence.get(uuid)) social.left(normalUuid(uuid));
    voice.onGroup(normalUuid(uuid), null);
    music.left(uuid);
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
    // Wartung: ohne Wartungs-Lobby wie früher abweisen, sonst dort warten lassen.
    if (net['maintenance'] === true && !alwaysIn(role) && !wartung.open()) {
      deny(wartung.screen(lang));
      return;
    }
    const full = presence.all().filter((p) => p.uuid !== uuid).length >= Number(net['maxPlayers']);
    if (full && !hasRight(role, 'reserved-slot')) {
      deny(text(lang, 'full.screen'));
      return;
    }
    presence.join({ uuid, name: m.name, bedrock: m.bedrock, lang });
    // Erster Server: die Lobby – ist sie nicht da (oder Wartung), die Wartungs-Lobby.
    const server = wartung.firstServer(uuid);
    if (server === WARTUNG_SERVER) wartung.waiting(uuid);
    reply(conn, m.id, { allow: true, lang, server });
  };

  const actorOf = (uuid: string): Actor | null => {
    const p = presence.get(uuid);
    return p ? { uuid: p.uuid, name: p.name, lang: p.lang, role: players.roleOf(p.uuid) } : null;
  };

  /** Spielserver sprechen nur für Spieler, die gerade bei ihnen sind – kein Server spricht für einen anderen. */
  const isHere = (conn: Connection, uuid: string): boolean =>
    presence.get(normalUuid(uuid))?.server === conn.server;

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
      wartung.onOnline();
      lobbySoon();
    },
    login,
    connecting,
    fallback,
    play,
    switch: (_conn, body) => {
      const m = switchSchema.parse(body);
      lobbySoon();
      const from = presence.get(m.uuid)?.server ?? null;
      const first = presence.get(m.uuid)?.server === null;
      presence.move(m.uuid, m.server);
      wartung.onSwitch(normalUuid(m.uuid), m.server);
      sendProfile(m.uuid);
      rejoin.moved(m.uuid, from, m.server);
      // Eingesperrt, aber auf einem anderen Server angekommen (mitten im Wechsel eingesperrt): zurück in die Zelle.
      const jail = m.server === LOBBY_SERVER ? undefined : punish.active(normalUuid(m.uuid), 'jail');
      if (jail && ctx.connect(normalUuid(m.uuid), LOBBY_SERVER)) {
        const lang = presence.get(m.uuid)?.lang ?? defaultLang();
        ctx.msg(
          normalUuid(m.uuid),
          text(lang, 'jail.blocked', {
            until: jail.expiresAt
              ? text(lang, 'punish.until', { date: dateText(lang, jail.expiresAt, ctx.timeZone) })
              : text(lang, 'punish.forever'),
          }),
        );
      }
      // Erst jetzt ist der Spieler wirklich da: Freunde erfahren es, offene Anfragen kommen an.
      if (first) social.joined(normalUuid(m.uuid));
      social.switched(normalUuid(m.uuid), m.server);
    },
    leave: (_conn, body) => {
      const uuid = leaveSchema.parse(body).uuid;
      leave(uuid);
      wartung.onLeave(normalUuid(uuid));
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
      if (!allowed(command, actor.role))
        ctx.msg(actor.uuid, text(actor.lang, command.noRight ?? 'cmd.no_right'));
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
    // ---------- Spielmodi ----------
    stats: (conn, body) => {
      const m = statsSchema.parse(body);
      if (servesMode(conn, m.mode) || lobbyStats(conn, m.mode)) stats.record(m);
    },
    // Zusammenfassung eines Spielers für das Panel (MorniCraft: Zuhause, Clan, Gräber) – nur vom Server des Modus.
    'mode-player': (conn, body) => {
      const m = modePlayerSchema.parse(body);
      const schema = MODE_PLAYER_SCHEMAS[m.mode];
      if (!schema || !servesMode(conn, m.mode)) return;
      const data = schema.safeParse(m.data);
      if (!data.success) {
        log.warn({ server: conn.server, mode: m.mode }, 'Hub: Spieler-Daten des Modus passen nicht');
        return;
      }
      saveModePlayer(db, m.mode, normalUuid(m.uuid), data.data);
    },
    // Einstellungen eingetragen: muss der Modus dafür neu starten?
    'mode-settings-state': (conn, body) => {
      const m = modeSettingsStateSchema.parse(body);
      if (!servesMode(conn, m.mode)) return;
      if (m.restart)
        log.info(
          { server: conn.server, mode: m.mode, changed: m.changed },
          'Hub: neue Einstellungen eingetragen – Neustart, sobald niemand spielt',
        );
      setRestart(m.mode, conn.server, m.restart);
    },
    'mode-state': (conn, body) => {
      const m = modeStateSchema.parse(body);
      if (!servesMode(conn, m.mode)) return;
      modeRuns.set(m.mode, { state: m.state, players: m.players, at: now() });
      lobbySoon();
    },
    party: (conn, body) => {
      const m = partyRequestSchema.parse(body);
      if (!isHere(conn, m.uuid)) {
        fail(conn, m.id, 'not_here');
        return;
      }
      const party = social.partyOf(normalUuid(m.uuid));
      reply(conn, m.id, {
        party: party && {
          leader: party.leader,
          members: party.members.map((u) => ({
            uuid: u,
            name: presence.get(u)?.name ?? players.get(u)?.name ?? '?',
            server: presence.get(u)?.server ?? null,
          })),
        },
      });
    },
    'to-lobby': (conn, body) => {
      const m = toLobbySchema.parse(body);
      if (!isHere(conn, m.uuid) || conn.server === LOBBY_SERVER) return;
      // Wie /lobby: in der Wartung bleibt man in der Wartungs-Lobby; ist die Lobby nicht da, sagt es der Hub.
      const uuid = normalUuid(m.uuid);
      const lang: Lang = presence.get(uuid)?.lang ?? defaultLang();
      const held = wartung.held(uuid, lang);
      if (held) {
        ctx.msg(uuid, held);
        return;
      }
      rejoin.sentAway(m.uuid, conn.server);
      if (!ctx.connect(uuid, LOBBY_SERVER)) ctx.msg(uuid, text(lang, 'lobby.missing'));
    },
    'voice-group': (conn, body) => {
      const m = voiceGroupSchema.parse(body);
      if (!isHere(conn, m.uuid)) return;
      voice.onGroup(normalUuid(m.uuid), m.group);
    },
    chat: (conn, body) => {
      const m = chatSchema.parse(body);
      if (!isHere(conn, m.uuid)) return;
      chat.handle(normalUuid(m.uuid), m.text, now(), m.tag);
    },
    ...rejoin.handlers,
    pack: music.onPack,
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
        conn.send(streamers.config());
        return;
      }
      conns.backends.set(conn.server, conn);
      events.emit('server.connected', { server: conn.server });
      conn.send({ t: 'welcome', server: conn.server, kind: conn.kind });
      conn.send(voice.config());
      conn.send(streamers.config());
      conn.send(lobbyState());
      if (conn.server === LOBBY_SERVER) {
        conn.send(lobbySettings());
        conn.send(lobbyMusicBody(stores));
        conn.send(jailState());
      }
      if (conn.server === morniCraftServer(stores)) conn.send(morniCraft());
      if (conn.server === WARTUNG_SERVER) conn.send(wartung.state());
      const modeArea = modeAreaOfServer(stores, conn.server);
      const modeSettings = modeArea ? modeSettingsBody(stores, modeArea) : null;
      if (modeSettings) conn.send(modeSettings);
      lobbySoon();
      wartung.onServer(conn.server);
      presence.on(conn.server).forEach((p) => sendProfile(p.uuid));
      rejoin.opened(conn.server);
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
      // Spieler, Anmeldungen und Befehle meldet nur der Proxy; Spielserver nur, was bei ihnen passiert.
      if (handler && PROXY_ONLY.has(body.t) !== (conn.kind === 'proxy'))
        log.warn({ server: conn.server, t: body.t }, 'Hub: Nachricht vom falschen Server abgelehnt');
      else if (handler) handler(conn, body);
      else log.warn({ server: conn.server, t: body.t }, 'Hub: unbekannte Nachricht');
    },
    onBinary: (conn, payload) => {
      if (conn.kind === 'backend') voice.onAudio(conn, payload);
    },
    onClose: (conn) => {
      if (conns.proxy === conn) conns.proxy = null;
      if (conns.backends.get(conn.server) === conn) {
        conns.backends.delete(conn.server);
        // Was der Modus zuletzt gemeldet hat (z. B. „closed“ beim Beenden), gilt nicht mehr – er schläft jetzt.
        stores
          .modes()
          .filter((md) => md.server === conn.server)
          .forEach((md) => modeRuns.delete(md.id));
        rejoin.closed(conn.server);
        lobbySoon();
        wartung.onServer(conn.server);
        // Gestoppt oder neu gestartet: Beim nächsten Start trägt das Plugin die Werte vorher ein.
        [...restartPending]
          .filter(([, server]) => server === conn.server)
          .forEach(([mode]) => setRestart(mode, conn.server, false));
      }
    },
  });

  events.on('settings.changed', ({ area }) => {
    const mc = morniCraftServer(stores);
    if (mc && MORNICRAFT_AREAS.has(area)) toBackend(mc, morniCraft());
    if (area === 'network') {
      toProxy(network());
      wartung.onSettings();
      rejoin.refresh();
      // Streamer-Modus: Adressen zum Verdecken an alle, und was jetzt für jeden gilt (erlaubt, Teile).
      const config = streamers.config();
      toProxy(config);
      conns.backends.forEach((c) => c.send(config));
      presence.all().forEach((p) => sendProfile(p.uuid));
    }
    if (area === 'lobby') {
      toBackend(LOBBY_SERVER, lobbySettings());
      toBackend(LOBBY_SERVER, lobbyMusicBody(stores));
    }
    if (area === 'voice') voice.broadcast();
    // Einstellungen eines Spielmodus → an seinen Server (schläft er, trägt MoinMorni sie vor dem Aufwachen ein).
    const modeServer = serverOfModeArea(stores, area);
    const changed = modeServer ? areaById(area) : undefined;
    const modeSettings = changed ? modeSettingsBody(stores, changed) : null;
    if (modeServer && modeSettings) toBackend(modeServer, modeSettings);
  });
  events.on('roles.changed', () => presence.all().forEach((p) => sendProfile(p.uuid)));
  events.on('modes.changed', lobbySoon);

  return {
    listen: transport.listen,
    close: async () => {
      voice.stop();
      wartung.stop();
      rejoin.stop();
      // Sonst feuert die verzögerte Lobby-Meldung noch nach dem Schließen (Datenbank schon zu).
      closed = true;
      clearInterval(jailTimer);
      if (lobbyTimer) clearTimeout(lobbyTimer);
      lobbyTimer = null;
      await transport.close();
    },
    keyFor: (server, kind) => serverKeyOf(hubSecret, server, kind),
    presence,
    players,
    punish,
    moderation,
    tell: (uuid, line) => ctx.msg(normalUuid(uuid), line),
    connect: (uuid, server) => ctx.connect(normalUuid(uuid), server),
    kick: (uuid, line) => ctx.kick(normalUuid(uuid), line),
    countdown: (uuid, line, seconds) => {
      toProxy({ t: 'countdown', uuid: normalUuid(uuid), text: line, seconds });
    },
    refreshProfile: refresh,
    proxyOnline: () => conns.proxy !== null,
    connectedServers: () => [...conns.backends.keys()],
    stats,
    modeStates: () => Object.fromEntries(modeRuns),
    modeRestarts: () => [...restartPending.keys()],
    heldServers: rejoin.heldServers,
    wartung: {
      open: wartung.open,
      park: (uuid) => wartung.park(normalUuid(uuid)),
      parked: (uuid) => wartung.parked(normalUuid(uuid)),
    },
  };
}
