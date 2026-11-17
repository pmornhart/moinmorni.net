import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { networkCommand, type Role } from '@moinmorni/shared';
import type { Api } from '../app.js';
import type { Db } from '../db/index.js';
import { settingValues, teamMembers } from '../db/schema.js';
import { normalUuid } from '../hub/players.js';
import { mm } from '../hub/texts.js';
import type { EventBus } from '../lib/events.js';
import type { Stores } from './stores.js';

/**
 * Verbindungen eines Team-Kontos (Panel → Mein Konto → Verbindungen): Minecraft und Discord.
 *
 * Verbunden wird nur mit Beweis: Das Panel zeigt einen kurzen Code, die Person tippt ihn im Spiel (`/verbinden <code>`)
 * bzw. in Discord (`/verbinden code:<code>`). Erst dann gilt das Minecraft-Konto (UUID aus der Verbindung des Spielers,
 * nicht aus einem eingetippten Namen) bzw. das Discord-Konto als verbunden – und dort gilt dann die Team-Rolle: Rang im
 * Spiel (Hub `roleOf`) und Rolle in Discord. Codes: zufällig, 10 Minuten gültig, einmalig, je Konto und Art nur einer.
 *
 * Gespeichert wird ohne neue Tabelle in `setting_values` (Bereich `_konten`, Schlüssel = Motor-Konto): ob das
 * Minecraft-Konto im Spiel bestätigt ist, Discord-Konto, gesperrt (Spiegel des Motors), eine vom Panel getrennte alte
 * Motor-Verknüpfung. Die UUID selbst bleibt in `team_members.minecraft_uuid` (dort lesen Hub, Webseite, Whitelist).
 * Alte Verknüpfungen aus dem Motor (per Name, ohne Bestätigung) gelten weiter – das Panel zeigt sie als „noch nicht im
 * Spiel bestätigt“; neue gibt es im Motor nicht mehr (Weiterleitung gesperrt, siehe motor/proxy.ts).
 */

const STORE_AREA = '_konten';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_MINUTES = 10;
const MINUTE_MS = 60_000;
/** Falsche Codes im Spiel/Discord: höchstens so viele je Person in 10 Minuten. */
const WRONG_MAX = 5;
const WRONG_WINDOW_MINUTES = 10;
const WRONG_WINDOW_MS = WRONG_WINDOW_MINUTES * MINUTE_MS;
/** 32 Zeichen im Alphabet: Byte & 31 ist gleich verteilt. */
const CODE_MASK = CODE_ALPHABET.length - 1;
/** So oft neu würfeln, falls ein Code schon vergeben ist. */
const CODE_TRIES = 4;
const CODE_PER_MINUTE = 10;
const CODES_MAX = 5000;
const NAME_MAX = 64;
// Discord-Avatar-Hash: hex, animierte mit „a_“ davor, z. B. "a_1b2c3d4e5f60718293a4b5c6d7e8f901".
// https://regex101.com/?flavor=javascript&regex=%5E(a_)%3F%5Ba-f0-9%5D%7B32%7D%24&testString=a_1b2c3d4e5f60718293a4b5c6d7e8f901
const AVATAR_HASH = /^(a_)?[a-f0-9]{32}$/;
// Discord-ID: nur Ziffern, z. B. "123456789012345678" (nicht "12a").
// https://regex101.com/?flavor=javascript&regex=%5E%5Cd%7B1%2C25%7D%24&testString=123456789012345678
const SNOWFLAKE = /^\d{1,25}$/;

export type LinkKind = 'minecraft' | 'discord';

export interface LinkState {
  /** Diese UUID hat die Person im Spiel bestätigt. */
  readonly confirmed?: string;
  readonly discordId?: string;
  readonly discordName?: string;
  readonly discordAvatar?: string;
  /** Konto im Motor gesperrt: dann gilt die Team-Rolle nirgends. */
  readonly disabled?: boolean;
  /** Vom Panel getrennte alte Motor-Verknüpfung – nicht wieder übernehmen. */
  readonly ignored?: string;
}

const allLinks = (db: Db): Map<number, LinkState> =>
  new Map(
    db
      .select()
      .from(settingValues)
      .where(eq(settingValues.area, STORE_AREA))
      .all()
      .map((r) => [Number(r.key), (r.value ?? {}) as LinkState] as const),
  );

export function linkOf(db: Db, motorUserId: number): LinkState {
  const row = db
    .select()
    .from(settingValues)
    .where(and(eq(settingValues.area, STORE_AREA), eq(settingValues.key, String(motorUserId))))
    .get();
  return (row?.value ?? {}) as LinkState;
}

export function putLink(db: Db, motorUserId: number, patch: Partial<Record<keyof LinkState, unknown>>): void {
  const next = Object.fromEntries(
    Object.entries({ ...linkOf(db, motorUserId), ...patch }).filter(([, v]) => v !== undefined && v !== null),
  );
  const updatedAt = new Date().toISOString();
  db.insert(settingValues)
    .values({ area: STORE_AREA, key: String(motorUserId), value: next, updatedAt })
    .onConflictDoUpdate({ target: [settingValues.area, settingValues.key], set: { value: next, updatedAt } })
    .run();
}

/** Gesperrte Team-Konten (deren Rolle gilt weder im Spiel noch in Discord). */
export function disabledMembers(db: Db): ReadonlySet<number> {
  return new Set([...allLinks(db)].filter(([, l]) => l.disabled === true).map(([id]) => id));
}

/** Höchste Team-Rolle eines Discord-Kontos (verbundene, nicht gesperrte Team-Konten). */
export function teamRoleByDiscord(db: Db, stores: Pick<Stores, 'role'>, discordId: string): Role | undefined {
  const links = allLinks(db);
  const ids = [...links].filter(([, l]) => l.discordId === discordId && !l.disabled).map(([id]) => id);
  return db
    .select()
    .from(teamMembers)
    .all()
    .filter((m) => ids.includes(m.motorUserId))
    .map((m) => stores.role(m.roleId))
    .filter((r): r is Role => Boolean(r))
    .sort((a, b) => a.position - b.position)[0];
}

export interface LinksView {
  readonly minecraft: { readonly uuid: string; readonly name: string; readonly confirmed: boolean } | null;
  readonly discord: { readonly id: string; readonly name: string; readonly avatar: string | null } | null;
}

export type ClaimResult =
  | { readonly ok: true; readonly username: string }
  | { readonly ok: false; readonly reason: 'wrong' | 'slow' };

/** Was sich geändert hat: Hub zieht die Ränge dieser Spieler nach, Discord die Rollen dieser Konten. */
export interface TeamChange {
  readonly uuids: string[];
  readonly discordIds: string[];
}

export interface AccountLinks {
  readonly newCode: (kind: LinkKind, motorUserId: number) => { code: string; expiresAt: string };
  /** Im Spiel: `/verbinden <code>` von dieser UUID. */
  readonly claimMinecraft: (code: string, uuid: string) => ClaimResult;
  /** In Discord: `/verbinden code:<code>` von diesem Konto. */
  readonly claimDiscord: (
    code: string,
    user: { readonly id: string; readonly name: string; readonly avatar?: string | null },
  ) => ClaimResult;
  readonly unlink: (kind: LinkKind, motorUserId: number) => void;
  readonly view: (motorUserId: number, nameOf: (uuid: string) => string | undefined) => LinksView;
  /** Ist der Code ein Panel-Code (für Discord: erst die Codes des Spiels, dann diese)? */
  readonly isCode: (code: string) => boolean;
  /** Team-Rolle geändert, Konto gesperrt/entsperrt oder entfernt: Spiel und Discord ziehen nach. */
  readonly changed: (motorUserId: number, before?: { uuid: string | null }) => void;
  readonly emit: (change: TeamChange) => void;
}

export function createAccountLinks(db: Db, events: EventBus, now: () => number = Date.now): AccountLinks {
  const codes = new Map<string, { kind: LinkKind; motorUserId: number; until: number }>();
  const wrong = new Map<string, number[]>();

  const member = (id: number) => db.select().from(teamMembers).where(eq(teamMembers.motorUserId, id)).get();
  const sweep = (): void => {
    const t = now();
    [...codes].filter(([, v]) => v.until < t).forEach(([k]) => codes.delete(k));
    [...wrong].forEach(([k, list]) => {
      const fresh = list.filter((at) => t - at < WRONG_WINDOW_MS);
      if (fresh.length) wrong.set(k, fresh);
      else wrong.delete(k);
    });
  };
  const randomCode = (): string =>
    // 32 Zeichen: jedes Byte & 31 ist gleich verteilt.
    Array.from(crypto.randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b & CODE_MASK] ?? '').join('');
  const emit = (change: TeamChange): void => {
    const uuids = [...new Set(change.uuids.filter(Boolean).map(normalUuid))];
    const discordIds = [...new Set(change.discordIds.filter(Boolean))];
    if (uuids.length || discordIds.length) events.emit('team.changed', { uuids, discordIds });
  };

  /** Code prüfen und verbrauchen; zu viele falsche Versuche → „slow“, ohne zu verraten, ob er stimmte. */
  const take = (kind: LinkKind, raw: string, who: string) => {
    sweep();
    const tries = wrong.get(who) ?? [];
    if (tries.length >= WRONG_MAX) return 'slow' as const;
    const code = raw.trim().toUpperCase();
    const entry = codes.get(code);
    if (!entry || entry.kind !== kind) {
      wrong.set(who, [...tries, now()]);
      return 'wrong' as const;
    }
    codes.delete(code);
    const m = member(entry.motorUserId);
    if (!m) return 'wrong' as const;
    return m;
  };

  return {
    newCode: (kind, motorUserId) => {
      sweep();
      [...codes]
        .filter(([, v]) => v.kind === kind && v.motorUserId === motorUserId)
        .forEach(([k]) => codes.delete(k));
      if (codes.size >= CODES_MAX)
        [...codes.keys()].slice(0, codes.size - CODES_MAX + 1).forEach((k) => codes.delete(k));
      const code = Array.from({ length: CODE_TRIES }, randomCode).find((c) => !codes.has(c)) ?? randomCode();
      const until = now() + CODE_MINUTES * MINUTE_MS;
      codes.set(code, { kind, motorUserId, until });
      return { code, expiresAt: new Date(until).toISOString() };
    },
    isCode: (raw) => codes.has(raw.trim().toUpperCase()),
    claimMinecraft: (raw, rawUuid) => {
      const uuid = normalUuid(rawUuid);
      const m = take('minecraft', raw, `mc:${uuid}`);
      if (typeof m === 'string') return { ok: false, reason: m };
      const old = m.minecraftUuid ? normalUuid(m.minecraftUuid) : null;
      // Wer im Spiel beweist, dass ihm das Konto gehört, gewinnt: bei jedem anderen Team-Konto fällt es weg.
      const others = db
        .select()
        .from(teamMembers)
        .all()
        .filter(
          (o) => o.motorUserId !== m.motorUserId && o.minecraftUuid && normalUuid(o.minecraftUuid) === uuid,
        );
      others.forEach((o) => {
        db.update(teamMembers)
          .set({ minecraftUuid: null })
          .where(eq(teamMembers.motorUserId, o.motorUserId))
          .run();
        putLink(db, o.motorUserId, { confirmed: null, ignored: uuid });
      });
      db.update(teamMembers)
        .set({ minecraftUuid: uuid })
        .where(eq(teamMembers.motorUserId, m.motorUserId))
        .run();
      putLink(db, m.motorUserId, { confirmed: uuid });
      emit({ uuids: [uuid, ...(old ? [old] : [])], discordIds: [] });
      return { ok: true, username: m.username };
    },
    claimDiscord: (raw, user) => {
      if (!SNOWFLAKE.test(user.id)) return { ok: false, reason: 'wrong' };
      const m = take('discord', raw, `dc:${user.id}`);
      if (typeof m === 'string') return { ok: false, reason: m };
      const old = linkOf(db, m.motorUserId).discordId;
      [...allLinks(db)]
        .filter(([id, l]) => id !== m.motorUserId && l.discordId === user.id)
        .forEach(([id]) => putLink(db, id, { discordId: null, discordName: null, discordAvatar: null }));
      putLink(db, m.motorUserId, {
        discordId: user.id,
        discordName: user.name.slice(0, NAME_MAX),
        discordAvatar: user.avatar && AVATAR_HASH.test(user.avatar) ? user.avatar : null,
      });
      emit({ uuids: [], discordIds: [user.id, ...(old ? [old] : [])] });
      return { ok: true, username: m.username };
    },
    unlink: (kind, motorUserId) => {
      const m = member(motorUserId);
      if (!m) return;
      if (kind === 'minecraft') {
        const old = m.minecraftUuid ? normalUuid(m.minecraftUuid) : null;
        db.update(teamMembers)
          .set({ minecraftUuid: null })
          .where(eq(teamMembers.motorUserId, motorUserId))
          .run();
        // Eine alte Motor-Verknüpfung nicht beim nächsten Seitenaufruf wieder übernehmen.
        putLink(db, motorUserId, { confirmed: null, ignored: old });
        if (old) emit({ uuids: [old], discordIds: [] });
        return;
      }
      const old = linkOf(db, motorUserId).discordId;
      putLink(db, motorUserId, { discordId: null, discordName: null, discordAvatar: null });
      if (old) emit({ uuids: [], discordIds: [old] });
    },
    view: (motorUserId, nameOf) => {
      const m = member(motorUserId);
      const link = linkOf(db, motorUserId);
      const uuid = m?.minecraftUuid ? normalUuid(m.minecraftUuid) : null;
      return {
        minecraft: uuid
          ? {
              uuid,
              name: nameOf(uuid) ?? '',
              confirmed: link.confirmed !== undefined && normalUuid(link.confirmed) === uuid,
            }
          : null,
        discord: link.discordId
          ? { id: link.discordId, name: link.discordName ?? '', avatar: link.discordAvatar ?? null }
          : null,
      };
    },
    changed: (motorUserId, before) => {
      const m = member(motorUserId);
      const link = linkOf(db, motorUserId);
      emit({
        uuids: [...(m?.minecraftUuid ? [m.minecraftUuid] : []), ...(before?.uuid ? [before.uuid] : [])],
        discordIds: link.discordId ? [link.discordId] : [],
      });
    },
    emit,
  };
}

// ---------- Panel ----------

const kindParams = z.object({ kind: z.enum(['minecraft', 'discord']) });
const CODE_LIMIT = { max: CODE_PER_MINUTE, timeWindow: '1 minute' } as const;

export function registerAccountLinkRoutes(
  app: Api,
  auth: import('./auth.js').PanelAuth,
  links: AccountLinks,
  deps: {
    readonly nameOf: (uuid: string) => string | undefined;
    /** Ist der Discord-Bot verbunden (sonst gibt es den Discord-Weg nicht)? */
    readonly discordReady: () => boolean;
  },
): void {
  app.get('/api/panel/account/links', async (request) => {
    const me = await auth.require(request);
    return { ...links.view(me.motorUserId, deps.nameOf), discordReady: deps.discordReady() };
  });
  app.post(
    '/api/panel/account/links/:kind/code',
    { schema: { params: kindParams }, config: { rateLimit: CODE_LIMIT } },
    async (request) => {
      const me = await auth.require(request);
      return links.newCode(request.params.kind, me.motorUserId);
    },
  );
  app.delete(
    '/api/panel/account/links/:kind',
    { schema: { params: kindParams }, config: { rateLimit: CODE_LIMIT } },
    async (request) => {
      const me = await auth.require(request);
      links.unlink(request.params.kind, me.motorUserId);
      return { ok: true };
    },
  );
}

// ---------- Im Spiel: /verbinden <code> (/link) ----------

const GAME_TEXT = {
  ok: {
    de: '<green>✔ Verbunden!</green> Dein Minecraft-Konto gehört jetzt zum Panel-Konto <gold>{name}</gold> – dein Team-Rang gilt ab sofort.',
    en: '<green>✔ Linked!</green> Your Minecraft account now belongs to the panel account <gold>{name}</gold> – your team rank applies right away.',
  },
  wrong: {
    de: '<red>Der Code stimmt nicht oder ist abgelaufen.</red> Hol dir im Panel unter Mein Konto → Verbindungen einen neuen.',
    en: '<red>That code is wrong or expired.</red> Get a new one in the panel under My account → Connections.',
  },
  slow: {
    de: '<red>Zu viele falsche Codes</red> – bitte in ein paar Minuten noch einmal.',
    en: '<red>Too many wrong codes</red> – please try again in a few minutes.',
  },
} as const;

export function createLinkCommand(
  ctx: Pick<import('../hub/context.js').HubContext, 'msg'>,
  links: AccountLinks,
  /** Ohne Code: wie /discord (Einladung und Code für Discord). */
  withoutCode: (actor: import('../hub/commands.js').Actor) => void,
): import('../hub/commands.js').Command {
  return {
    ...networkCommand('verbinden'),
    run: (actor, args) => {
      const code = args[0];
      if (!code) {
        withoutCode(actor);
        return;
      }
      const result = links.claimMinecraft(code, actor.uuid);
      const key = result.ok ? 'ok' : result.reason;
      const text = GAME_TEXT[key][actor.lang].replace('{name}', result.ok ? mm(result.username) : '');
      ctx.msg(actor.uuid, text);
    },
  };
}
