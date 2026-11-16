import type { FastifyBaseLogger } from 'fastify';
import type { Role } from '@moinmorni/shared';
import type { Stores } from '../panel/stores.js';
import type { Appearance, IconResult } from './appearance.js';
import { DISCORD_CODES, DiscordError } from './client.js';
import {
  CHANNEL_CATEGORY,
  colourInt,
  discordRoleName,
  EXTRA_ROLES,
  invitePermissions,
  isTeam,
  layout,
  OVERWRITE_MEMBER,
  overwritesFor,
  PERM,
  permNames,
  rolePermissions,
  VOICE_KEY_PREFIX,
  withinBot,
  type Audience,
  type Overwrite,
  type PermName,
  type RoleIds,
} from './layout.js';
import {
  applyMessage,
  helpMessage,
  modesMessages,
  rulesMessage,
  statusMessage,
  ticketsMessage,
  welcomeMessage,
  type BoardContext,
  type Body,
} from './messages.js';
import { positionChanges, roleOrder } from './role-order.js';
import type { DiscordStore } from './store.js';

/**
 * „Server einrichten“: Schritt für Schritt mit Fortschritt fürs Panel – Rechte prüfen, Rollen (Reihenfolge und Farbe
 * der Ränge), Kategorien und Kanäle mit Emoji und Rechten, Nachrichten, Befehle, Community, Server-Symbol. Wiederholbar:
 * Was der Bot schon kennt, aktualisiert er; Vorhandenes gleichen Namens übernimmt er; was jemand in Discord selbst
 * umbenannt oder verschoben hat, bleibt; löschen tut er nur, was er selbst angelegt hat (alte Sprachkanäle).
 * Bremst Discord („zu viele Anfragen“), wartet der Bot die genannte Zeit ab und sagt das im Panel.
 */

type Rest = <T>(method: string, path: string, body?: unknown, reason?: string) => Promise<T>;

interface DRole {
  readonly id: string;
  readonly name: string;
  readonly color: number;
  readonly permissions: string;
  readonly position: number;
  readonly hoist: boolean;
  readonly mentionable: boolean;
  readonly managed?: boolean;
}
interface DChannel {
  readonly id: string;
  readonly name: string;
  readonly type: number;
  readonly parent_id?: string | null;
  readonly topic?: string | null;
  readonly permission_overwrites?: readonly Overwrite[];
}

export const SETUP_STEPS = [
  'check',
  'roles',
  'channels',
  'messages',
  'commands',
  'community',
  'icon',
] as const;
export type SetupStepKey = (typeof SETUP_STEPS)[number];
export type StepState = 'waiting' | 'running' | 'done' | 'skipped' | 'failed';

export interface SetupStep {
  readonly key: SetupStepKey;
  readonly state: StepState;
  readonly done: number;
  readonly total: number;
  /** Fehlercode (z. B. „discord_missing_permissions“), wenn der Schritt nicht ging. */
  readonly error: string | null;
}

export interface SetupReport {
  readonly roles: number;
  readonly channels: number;
  readonly messages: number;
  /** Neu angelegt in diesem Lauf. */
  readonly created: number;
  /** Was jemand in Discord selbst geändert hat und darum so bleibt (Namen). */
  readonly kept: readonly string[];
  readonly community: 'ok' | 'failed' | 'already';
  readonly icon: IconResult | 'failed';
  /** Rechte, die dem Bot fehlen (er lässt dann aus, was er damit bräuchte). */
  readonly missing: readonly PermName[];
  /** Die Owner-Rolle bekommt „Administrator“ nur von Hand in Discord (der Bot darf das nicht vergeben). */
  readonly ownerAdminManual: boolean;
}

export interface SetupProgress {
  readonly running: boolean;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  /** Discord bremst gerade: bis dann wartet der Bot. */
  readonly waitUntil: string | null;
  readonly error: string | null;
  /** Bei fehlenden Rechten: welche. */
  readonly missing: readonly PermName[];
  readonly steps: readonly SetupStep[];
  readonly report: SetupReport | null;
}

export interface SetupDeps {
  readonly rest: Rest;
  readonly store: DiscordStore;
  readonly stores: Stores;
  readonly guildId: () => string | null;
  readonly botUserId: () => Promise<string>;
  readonly commands: () => Promise<{ readonly appId: string; readonly list: readonly unknown[] }>;
  readonly board: () => Promise<BoardContext>;
  readonly appearance: Appearance;
  /** Meldet Wartezeiten von Discord (client.onWait). */
  readonly onWait: (listener: (ms: number) => void) => () => void;
  readonly log: FastifyBaseLogger;
}

export interface DiscordSetup {
  /** Ganzer Lauf (wartet bis zum Ende). */
  readonly run: () => Promise<SetupReport>;
  /** Im Hintergrund starten (läuft schon einer, bleibt es bei dem). */
  readonly start: () => SetupProgress;
  readonly progress: () => SetupProgress;
  /** Feste Nachrichten neu schreiben (nach Änderungen im Panel) – nur die, die es schon gibt. */
  readonly refreshMessages: (
    which: 'rules' | 'apply' | 'modes' | 'welcome' | 'help' | 'all',
  ) => Promise<void>;
}

const ROLE_ORDER_KEY = 'roles:order';
const SETUP_KEY = 'setup';
const INVITE_KEY = 'invite';
const HTTP_NOT_FOUND = 404;
const HTTP_FORBIDDEN = 403;
const VERIFICATION_LOW = 1;
const CONTENT_FILTER_ALL = 2;
const MODES_PREFIX = 'msg:modes:';
const DATE_LENGTH = 10;
/** Kein Recht. */
const NO_PERMS = 0n;
/** Der Bot ist Administrator: darf alles. */
const ALL_PERMS = -1n;
/** Nach den festen Nachrichten noch: Spielmodi und Einladung. */
const EXTRA_MESSAGE_STEPS = 2;

const idle = (): SetupProgress => ({
  running: false,
  startedAt: null,
  finishedAt: null,
  waitUntil: null,
  error: null,
  missing: [],
  steps: SETUP_STEPS.map((key) => ({ key, state: 'waiting', done: 0, total: 0, error: null })),
  report: null,
});

class SetupError extends Error {
  override readonly name = 'SetupError';
  constructor(
    readonly code: string,
    readonly missing: readonly PermName[] = [],
  ) {
    super(code);
  }
}

/** Fehlercode für einen gescheiterten Schritt. */
function codeOf(err: unknown): string {
  if (err instanceof SetupError) return err.code;
  if (err instanceof DiscordError) {
    if (err.code === DISCORD_CODES.missingPermissions || err.code === DISCORD_CODES.missingAccess)
      return 'discord_missing_permissions';
    return err.status === HTTP_FORBIDDEN ? 'discord_missing_permissions' : 'discord_failed';
  }
  return err instanceof Error && err.message.startsWith('discord_') ? err.message : 'discord_failed';
}

const denied = (err: unknown): boolean =>
  err instanceof DiscordError &&
  (err.status === HTTP_FORBIDDEN ||
    err.code === DISCORD_CODES.missingPermissions ||
    err.code === DISCORD_CODES.missingAccess);

export function createDiscordSetup(deps: SetupDeps): DiscordSetup {
  const { rest, store, stores, log } = deps;
  const state: { progress: SetupProgress; job: Promise<SetupReport> | null } = {
    progress: idle(),
    job: null,
  };
  const step = (key: SetupStepKey, change: Partial<SetupStep>): void => {
    state.progress = {
      ...state.progress,
      steps: state.progress.steps.map((s) => (s.key === key ? { ...s, ...change } : s)),
    };
  };
  const tick = (key: SetupStepKey): void => {
    const s = state.progress.steps.find((x) => x.key === key);
    if (s) step(key, { done: s.done + 1 });
  };
  const templateRoles = (): Role[] => stores.roles().filter((r) => !r.fallback);

  // ---------- Rechte des Bots ----------
  const botPermissions = async (g: string, botId: string, roles: readonly DRole[]): Promise<bigint> => {
    const me = await rest<{ roles: string[] }>('GET', `/guilds/${g}/members/${botId}`);
    const perms = roles
      .filter((r) => r.id === g || me.roles.includes(r.id))
      .reduce((acc, r) => acc | BigInt(r.permissions), NO_PERMS);
    return (perms & PERM.administrator) !== NO_PERMS ? ALL_PERMS : perms;
  };

  // ---------- Rollen ----------
  interface RoleWant {
    readonly key: string;
    readonly name: string;
    readonly color: number;
    readonly permissions: bigint;
    readonly hoist: boolean;
    readonly mentionable: boolean;
  }
  const roleWants = (): RoleWant[] => [
    ...templateRoles().map((r) => ({
      key: `role:${r.id}`,
      name: discordRoleName(r),
      color: colourInt(r.colour),
      permissions: rolePermissions(r),
      hoist: isTeam(r) || r.discord.includes('vip-area') || r.discord.includes('media-area'),
      mentionable: isTeam(r),
    })),
    ...EXTRA_ROLES.map((r) => ({
      key: `role:${r.key}`,
      name: r.name,
      color: r.colour,
      permissions: NO_PERMS,
      hoist: r.hoist,
      mentionable: false,
    })),
  ];

  interface Run {
    readonly g: string;
    readonly botId: string;
    readonly botPerms: bigint;
  }
  /** Was im laufenden Durchgang passiert (wird bei jedem Lauf neu angelegt). */
  const tally = {
    claimed: new Set<string>(),
    created: 0,
    kept: [] as string[],
    ownerAdminManual: false,
  };

  const claimedIds = (): Set<string> =>
    new Set(['role:', 'cat:', 'ch:'].flatMap((prefix) => store.withPrefix(prefix).map((e) => e.id)));

  /** Felder, die nur gesetzt werden, solange niemand sie in Discord geändert hat. */
  const owned = <T extends Record<string, unknown>>(
    found: Record<string, unknown>,
    applied: Readonly<Record<string, unknown>> | null,
    want: T,
  ): { readonly body: Partial<T>; readonly applied: Record<string, unknown>; readonly kept: boolean } => {
    const keys = Object.keys(want) as Array<keyof T & string>;
    const free = keys.filter((k) => applied === null || found[k] === applied[k]);
    const body = Object.fromEntries(free.map((k) => [k, want[k]])) as Partial<T>;
    const remembered = Object.fromEntries(keys.map((k) => [k, free.includes(k) ? want[k] : applied?.[k]]));
    const kept = keys.some((k) => !free.includes(k) && found[k] !== want[k]);
    return { body, applied: remembered, kept };
  };

  const ensureRole = async (run: Run, existing: readonly DRole[], want: RoleWant): Promise<boolean> => {
    const known = store.entry(want.key);
    const byId = known ? existing.find((r) => r.id === known.id) : undefined;
    const byName = byId
      ? undefined
      : existing.find(
          (r) => r.name === want.name && !r.managed && !tally.claimed.has(r.id) && r.id !== run.g,
        );
    const found = byId ?? byName;
    const admin = run.botPerms === ALL_PERMS;
    const grantable = admin ? want.permissions : want.permissions & run.botPerms;
    if ((want.permissions & PERM.administrator) !== NO_PERMS && !admin) tally.ownerAdminManual = true;
    const look = { name: want.name, color: want.color, hoist: want.hoist, mentionable: want.mentionable };
    if (!found) {
      const role = await rest<DRole>(
        'POST',
        `/guilds/${run.g}/roles`,
        { ...look, permissions: grantable.toString() },
        'MoinMorni: Rolle anlegen',
      );
      store.put(want.key, role.id, { created: true, applied: look });
      tally.claimed.add(role.id);
      tally.created += 1;
      return true;
    }
    tally.claimed.add(found.id);
    const change = owned(
      found as unknown as Record<string, unknown>,
      byId ? (known?.applied ?? null) : null,
      look,
    );
    // Hat die Rolle schon „Administrator“ (von Hand gesetzt) und der Bot nicht, fasst er die Rechte nicht an.
    const keepPerms = !admin && (BigInt(found.permissions) & PERM.administrator) !== NO_PERMS;
    try {
      await rest(
        'PATCH',
        `/guilds/${run.g}/roles/${found.id}`,
        { ...change.body, ...(keepPerms ? {} : { permissions: grantable.toString() }) },
        'MoinMorni: Rolle aktualisieren',
      );
    } catch (err) {
      // Liegt über der Rolle des Bots (in Discord nach oben gezogen): bleibt, wie sie ist.
      if (!denied(err)) throw err;
      tally.kept.push(found.name);
    }
    if (change.kept) tally.kept.push(found.name);
    store.put(want.key, found.id, { applied: change.applied });
    return false;
  };

  const ensureRoles = async (run: Run): Promise<number> => {
    const wants = roleWants();
    step('roles', { state: 'running', total: wants.length + 1 });
    const before = await rest<DRole[]>('GET', `/guilds/${run.g}/roles`);
    const fresh = new Set<string>();
    await wants.reduce(async (prev, want) => {
      await prev;
      if (await ensureRole(run, before, want)) fresh.add(want.key);
      tick('roles');
    }, Promise.resolve());
    // Reihenfolge wie die Ränge – nur unter den eigenen Rollen, Selbst-Umsortiertes bleibt.
    const after = await rest<DRole[]>('GET', `/guilds/${run.g}/roles`);
    const ours = wants
      .map((w) => ({ key: w.key, role: after.find((r) => r.id === store.get(w.key)) }))
      .filter((x): x is { key: string; role: DRole } => Boolean(x.role));
    const current = [...ours].sort((a, b) => b.role.position - a.role.position).map((x) => x.key);
    const last = store.entry(ROLE_ORDER_KEY)?.applied?.['order'];
    const order = roleOrder(
      current,
      wants.map((w) => w.key),
      Array.isArray(last) ? last.map(String) : null,
      fresh,
    );
    const moves = positionChanges(
      order,
      new Map(ours.map((x) => [x.key, x.role.position])),
      new Map(ours.map((x) => [x.key, x.role.id])),
    );
    if (moves.length)
      await rest('PATCH', `/guilds/${run.g}/roles`, moves, 'MoinMorni: Reihenfolge der Rollen').catch(
        (err: unknown) => {
          if (!denied(err)) throw err;
          log.warn('Discord: Reihenfolge der Rollen nicht erlaubt (Rolle des Bots zu weit unten)');
        },
      );
    store.put(ROLE_ORDER_KEY, '-', { applied: { order } });
    // Der Bot trägt selbst die Rolle „🤖 Bot“ (eigene Gruppe in der Mitgliederliste).
    const botRole = store.get('role:bot');
    if (botRole)
      await rest(
        'PUT',
        `/guilds/${run.g}/members/${run.botId}/roles/${botRole}`,
        undefined,
        'MoinMorni: Bot',
      ).catch((err: unknown) => log.warn({ err }, 'Discord: Rolle „Bot“ nicht vergeben'));
    tick('roles');
    step('roles', { state: 'done' });
    return wants.length;
  };

  // ---------- Kanäle ----------
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
      .map((r) => store.get(`role:${r.id}`))
      .filter((id): id is string => Boolean(id));
  };

  /** Eigene Einträge (unsere Rollen, @everyone, der Bot) setzt der Bot; fremde (von Hand) bleiben dazu stehen. */
  const merged = (
    want: readonly Overwrite[],
    existing: readonly Overwrite[] | undefined,
    mine: ReadonlySet<string>,
  ) => [...want, ...(existing ?? []).filter((o) => !mine.has(o.id) && !want.some((w) => w.id === o.id))];

  const ensureChannel = async (
    run: Run,
    existing: readonly DChannel[],
    key: string,
    want: {
      readonly name: string;
      readonly type: number;
      readonly parent_id?: string;
      readonly topic?: string;
      readonly overwrites: readonly Overwrite[];
    },
    mine: ReadonlySet<string>,
  ): Promise<string> => {
    const known = store.entry(key);
    const byId = known ? existing.find((c) => c.id === known.id) : undefined;
    const byName = byId
      ? undefined
      : existing.find((c) => c.name === want.name && c.type === want.type && !tally.claimed.has(c.id));
    const found = byId ?? byName;
    const overwrites = withinBot(merged(want.overwrites, found?.permission_overwrites, mine), run.botPerms);
    const look = {
      name: want.name,
      ...(want.parent_id ? { parent_id: want.parent_id } : {}),
      ...(want.topic ? { topic: want.topic } : {}),
    };
    if (!found) {
      const channel = await rest<DChannel>(
        'POST',
        `/guilds/${run.g}/channels`,
        { ...look, type: want.type, permission_overwrites: overwrites },
        'MoinMorni: Kanal anlegen',
      );
      store.put(key, channel.id, { created: true, applied: look });
      tally.claimed.add(channel.id);
      tally.created += 1;
      return channel.id;
    }
    tally.claimed.add(found.id);
    const change = owned(
      found as unknown as Record<string, unknown>,
      byId ? (known?.applied ?? null) : null,
      look,
    );
    if (change.kept) tally.kept.push(found.name);
    await rest(
      'PATCH',
      `/channels/${found.id}`,
      { ...change.body, permission_overwrites: overwrites },
      'MoinMorni: Kanal aktualisieren',
    );
    store.put(key, found.id, { applied: change.applied });
    return found.id;
  };

  const ensureChannels = async (run: Run): Promise<number> => {
    const voice = (stores.settings('voice')['channels'] as string[] | undefined) ?? [];
    const cats = layout(voice);
    step('channels', { state: 'running', total: cats.reduce((n, c) => n + 1 + c.channels.length, 0) });
    const ids: RoleIds = {
      everyone: run.g,
      audience: audienceRoles,
      team: audienceRoles('team'),
      muted: store.get('role:muted') ?? run.g,
      jail: store.get('role:jail') ?? run.g,
      bot: run.botId,
    };
    const mine = new Set([run.g, run.botId, ...store.withPrefix('role:').map((e) => e.id)]);
    const existing = await rest<DChannel[]>('GET', `/guilds/${run.g}/channels`);
    const count = await cats.reduce(async (prev, cat) => {
      const before = await prev;
      const parent = await ensureChannel(
        run,
        existing,
        `cat:${cat.key}`,
        { name: cat.name, type: CHANNEL_CATEGORY, overwrites: overwritesFor(cat.audience, false, ids) },
        mine,
      );
      tick('channels');
      await cat.channels.reduce(async (p, ch) => {
        await p;
        await ensureChannel(
          run,
          existing,
          `ch:${ch.key}`,
          {
            name: ch.name,
            type: ch.type,
            parent_id: parent,
            ...(ch.topic ? { topic: ch.topic } : {}),
            overwrites: overwritesFor(ch.audience, ch.readOnly ?? false, ids),
          },
          mine,
        );
        tick('channels');
      }, Promise.resolve());
      return before + 1 + cat.channels.length;
    }, Promise.resolve(0));
    // Sprachkanäle, die es in den Einstellungen nicht mehr gibt: weg, wenn der Bot sie selbst angelegt hat.
    const wanted = new Set(voice.map((_, i) => `ch:${VOICE_KEY_PREFIX}${i}`));
    await store
      .withPrefix(`ch:${VOICE_KEY_PREFIX}`)
      .filter((e) => !wanted.has(e.key))
      .reduce(async (prev, e) => {
        await prev;
        if (e.created)
          await rest('DELETE', `/channels/${e.id}`, undefined, 'MoinMorni: Sprachkanal entfernt').catch(
            (err: unknown) => {
              if (!(err instanceof DiscordError && err.status === HTTP_NOT_FOUND)) throw err;
            },
          );
        store.drop(e.key);
      }, Promise.resolve());
    step('channels', { state: 'done' });
    return count;
  };

  // ---------- Nachrichten ----------
  /** Nachricht schreiben oder (wenn es sie schon gibt) ändern; liegt sie in einem anderen Kanal, zieht sie um. */
  const ensureMessage = async (key: string, channel: string, body: Body, create = true): Promise<boolean> => {
    const known = store.entry(key);
    const where = known?.applied?.['channel'];
    const sameChannel = known && (where === undefined || where === channel);
    if (known && sameChannel) {
      try {
        await rest('PATCH', `/channels/${channel}/messages/${known.id}`, body);
        if (where === undefined) store.put(key, known.id, { applied: { channel } });
        return true;
      } catch (err) {
        if (!(err instanceof DiscordError && err.status === HTTP_NOT_FOUND)) throw err;
      }
    }
    if (!create) return false;
    if (known && typeof where === 'string' && where !== channel)
      await rest('DELETE', `/channels/${where}/messages/${known.id}`).catch(() => undefined);
    const msg = await rest<{ id: string }>('POST', `/channels/${channel}/messages`, body);
    store.put(key, msg.id, { created: true, applied: { channel } });
    return true;
  };

  type Which = 'rules' | 'apply' | 'modes' | 'welcome' | 'help' | 'status' | 'tickets';
  const writers = (ctx: BoardContext): ReadonlyArray<readonly [Which, string, string, () => Body]> => [
    ['welcome', 'msg:welcome', 'welcome', () => welcomeMessage(ctx)],
    ['rules', 'msg:rules', 'rules', () => rulesMessage(ctx)],
    ['help', 'msg:help', 'help', () => helpMessage(ctx)],
    ['tickets', 'msg:tickets', 'tickets', () => ticketsMessage()],
    ['apply', 'msg:apply', 'apply', () => applyMessage(ctx)],
    ['status', 'msg:status', 'status', () => statusMessage(ctx.status)],
  ];

  const writeModes = async (ctx: BoardContext, create: boolean): Promise<number> => {
    const channel = store.get('ch:modes');
    if (!channel) return 0;
    const bodies = modesMessages(ctx);
    await bodies.reduce(async (prev, body, i) => {
      await prev;
      await ensureMessage(`${MODES_PREFIX}${i}`, channel, body, create);
    }, Promise.resolve());
    // Weniger Modi als früher: überzählige eigene Nachrichten weg.
    await store
      .withPrefix(MODES_PREFIX)
      .filter((e) => Number(e.key.slice(MODES_PREFIX.length)) >= bodies.length)
      .reduce(async (prev, e) => {
        await prev;
        await rest('DELETE', `/channels/${channel}/messages/${e.id}`).catch(() => undefined);
        store.drop(e.key);
      }, Promise.resolve());
    return bodies.length;
  };

  const ensureMessages = async (): Promise<number> => {
    const ctx = await deps.board();
    const list = writers(ctx);
    step('messages', { state: 'running', total: list.length + EXTRA_MESSAGE_STEPS });
    const written = await list.reduce(async (prev, [, key, channelKey, body]) => {
      const n = await prev;
      const channel = store.get(`ch:${channelKey}`);
      const ok = channel ? await ensureMessage(key, channel, body()) : false;
      tick('messages');
      return n + (ok ? 1 : 0);
    }, Promise.resolve(0));
    const modes = await writeModes(ctx, true);
    tick('messages');
    // Einladung für die Webseite (läuft nie ab) – einmal.
    const welcome = store.get('ch:welcome');
    if (welcome && !store.get(INVITE_KEY)) {
      const invite = await rest<{ code: string }>('POST', `/channels/${welcome}/invites`, {
        max_age: 0,
        max_uses: 0,
        unique: false,
      });
      store.put(INVITE_KEY, invite.code);
    }
    tick('messages');
    step('messages', { state: 'done' });
    return written + modes;
  };

  // ---------- Community ----------
  const community = async (run: Run): Promise<'ok' | 'failed' | 'already'> => {
    step('community', { state: 'running', total: 1 });
    try {
      const guild = await rest<{ features: string[] }>('GET', `/guilds/${run.g}`);
      if (guild.features.includes('COMMUNITY')) {
        step('community', { state: 'done', done: 1 });
        return 'already';
      }
      await rest('PATCH', `/guilds/${run.g}`, {
        verification_level: VERIFICATION_LOW,
        explicit_content_filter: CONTENT_FILTER_ALL,
        features: [...new Set([...guild.features, 'COMMUNITY'])],
        rules_channel_id: store.get('ch:rules'),
        public_updates_channel_id: store.get('ch:teamlog'),
      });
      step('community', { state: 'done', done: 1 });
      return 'ok';
    } catch (err) {
      log.warn({ err }, 'Discord: Community-Server ließ sich nicht einschalten');
      step('community', { state: 'failed', error: codeOf(err) });
      return 'failed';
    }
  };

  const run = async (): Promise<SetupReport> => {
    state.progress = { ...idle(), running: true, startedAt: new Date().toISOString() };
    const stopWaiting = deps.onWait((ms) => {
      state.progress = { ...state.progress, waitUntil: new Date(Date.now() + ms).toISOString() };
    });
    try {
      // 1. Prüfen: Server da, Rechte des Bots.
      step('check', { state: 'running', total: 1 });
      const g = deps.guildId();
      if (!g) throw new SetupError('discord_no_guild');
      const botId = await deps.botUserId();
      const roles = await rest<DRole[]>('GET', `/guilds/${g}/roles`);
      const botPerms = await botPermissions(g, botId, roles);
      const needed = invitePermissions(templateRoles());
      const missing = botPerms === ALL_PERMS ? [] : permNames(needed & ~botPerms);
      // Ohne „Rollen verwalten“ und „Kanäle verwalten“ geht gar nichts – dann lieber gleich sagen, was fehlt.
      if (missing.includes('manageRoles') || missing.includes('manageChannels'))
        throw new SetupError('discord_missing_permissions', missing);
      step('check', { state: 'done', done: 1 });
      const r: Run = { g, botId, botPerms };
      tally.claimed = claimedIds();
      tally.created = 0;
      tally.kept = [];
      tally.ownerAdminManual = false;
      const roleCount = await ensureRoles(r);
      const channelCount = await ensureChannels(r);
      const messageCount = await ensureMessages();
      step('commands', { state: 'running', total: 1 });
      const commands = await deps.commands();
      await rest('PUT', `/applications/${commands.appId}/guilds/${g}/commands`, commands.list);
      step('commands', { state: 'done', done: 1 });
      const communityResult = await community(r);
      step('icon', { state: 'running', total: 1 });
      const icon = await deps.appearance.ensureGuildLogo().catch((err: unknown) => {
        log.warn({ err }, 'Discord: Server-Symbol nicht gesetzt');
        step('icon', { state: 'failed', error: codeOf(err) });
        return 'failed' as const;
      });
      if (icon !== 'failed') step('icon', { state: icon === 'kept' ? 'skipped' : 'done', done: 1 });
      store.put(SETUP_KEY, new Date().toISOString().slice(0, DATE_LENGTH).replaceAll('-', ''));
      const report: SetupReport = {
        roles: roleCount,
        channels: channelCount,
        messages: messageCount,
        created: tally.created,
        kept: [...new Set(tally.kept)],
        community: communityResult,
        icon,
        missing,
        ownerAdminManual: tally.ownerAdminManual,
      };
      log.info({ guild: g, created: tally.created }, 'Discord: Server eingerichtet');
      state.progress = {
        ...state.progress,
        running: false,
        finishedAt: new Date().toISOString(),
        waitUntil: null,
        missing,
        report,
      };
      return report;
    } catch (err) {
      const code = codeOf(err);
      const running = state.progress.steps.find((s) => s.state === 'running');
      if (running) step(running.key, { state: 'failed', error: code });
      state.progress = {
        ...state.progress,
        running: false,
        finishedAt: new Date().toISOString(),
        waitUntil: null,
        error: code,
        missing: err instanceof SetupError ? err.missing : [],
      };
      throw err instanceof SetupError ? new Error(err.code) : err;
    } finally {
      stopWaiting();
    }
  };

  const refreshMessages = async (
    which: 'rules' | 'apply' | 'modes' | 'welcome' | 'help' | 'all',
  ): Promise<void> => {
    if (!deps.guildId() || !store.get(SETUP_KEY)) return;
    const ctx = await deps.board();
    await writers(ctx)
      .filter(([w]) => w !== 'status' && (which === 'all' || w === which))
      .reduce(async (prev, [, key, channelKey, body]) => {
        await prev;
        const channel = store.get(`ch:${channelKey}`);
        if (channel) await ensureMessage(key, channel, body(), false);
      }, Promise.resolve());
    if (which === 'modes' || which === 'all') await writeModes(ctx, false);
  };

  /** Ein Lauf zur Zeit: läuft schon einer, bekommt jeder denselben. */
  const launch = (): Promise<SetupReport> => {
    if (state.job) return state.job;
    const job = (async (): Promise<SetupReport> => {
      try {
        return await run();
      } finally {
        state.job = null;
      }
    })();
    state.job = job;
    return job;
  };

  return {
    run: launch,
    start: () => {
      if (!state.job)
        void (async () => {
          try {
            await launch();
          } catch (err) {
            log.warn({ err }, 'Discord: Einrichtung abgebrochen');
          }
        })();
      return state.progress;
    },
    progress: () => state.progress,
    refreshMessages,
  };
}
