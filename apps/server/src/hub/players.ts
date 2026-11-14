import { desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { Role } from '@moinmorni/shared';
import type { Db } from '../db/index.js';
import { players, teamMembers } from '../db/schema.js';
import type { Stores } from '../panel/stores.js';
import type { Lang } from './texts.js';

/** Spieler im Netzwerk: Name, Sprache, Rang, Spielzeit. */

export type PlayerRow = typeof players.$inferSelect;

const UUID_HEX = 32;
// UUID ohne Bindestriche (so speichert sie Mojang): "0123…" → mit Bindestrichen wie Velocity.
// https://regex101.com/?flavor=javascript&regex=%5E(%5B0-9a-f%5D%7B8%7D)(%5B0-9a-f%5D%7B4%7D)(%5B0-9a-f%5D%7B4%7D)(%5B0-9a-f%5D%7B4%7D)(%5B0-9a-f%5D%7B12%7D)%24&testString=069a79f444e94726a5befca90e38aaf5
const UNDASHED = /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/;

/** UUID immer klein und mit Bindestrichen. */
export function normalUuid(uuid: string): string {
  const lower = uuid.toLowerCase();
  return lower.length === UUID_HEX ? lower.replace(UNDASHED, '$1-$2-$3-$4-$5') : lower;
}

export interface SeenInput {
  readonly uuid: string;
  readonly name: string;
  readonly bedrock: boolean;
}

export interface PlayerService {
  readonly seen: (input: SeenInput) => PlayerRow;
  readonly get: (uuid: string) => PlayerRow | undefined;
  /** Nach Namen (ohne Groß/Klein); bei Namensgleichheit der zuletzt gesehene. */
  readonly byName: (name: string) => PlayerRow | undefined;
  readonly addMinutes: (uuid: string, minutes: number) => void;
  readonly setLanguage: (uuid: string, lang: Lang | null) => void;
  readonly setClientLocale: (uuid: string, locale: string) => void;
  readonly setRole: (uuid: string, roleId: string | null) => void;
  /** Rang im Spiel: der höhere aus eigenem Rang und Team-Rolle (verbundenes Minecraft-Konto), sonst „für alle“. */
  readonly roleOf: (uuid: string) => Role;
}

export function createPlayerService(db: Db, stores: Stores): PlayerService {
  const get = (uuid: string): PlayerRow | undefined =>
    db
      .select()
      .from(players)
      .where(eq(players.uuid, normalUuid(uuid)))
      .get();

  const fallback = (): Role => {
    const all = stores.roles();
    const found = all.find((r) => r.fallback) ?? all[all.length - 1];
    if (!found) throw new Error('no roles');
    return found;
  };

  return {
    seen: ({ uuid, name, bedrock }) => {
      const id = normalUuid(uuid);
      const at = new Date().toISOString();
      return db
        .insert(players)
        .values({ uuid: id, name, bedrock, firstSeen: at, lastSeen: at })
        .onConflictDoUpdate({ target: players.uuid, set: { name, bedrock, lastSeen: at } })
        .returning()
        .get();
    },
    get,
    byName: (name) =>
      db
        .select()
        .from(players)
        .where(eq(sql`lower(${players.name})`, name.toLowerCase()))
        .orderBy(desc(players.lastSeen))
        .get(),
    addMinutes: (uuid, minutes) => {
      db.update(players)
        .set({ playMinutes: sql`${players.playMinutes} + ${minutes}`, lastSeen: new Date().toISOString() })
        .where(eq(players.uuid, normalUuid(uuid)))
        .run();
    },
    setLanguage: (uuid, lang) => {
      db.update(players)
        .set({ language: lang })
        .where(eq(players.uuid, normalUuid(uuid)))
        .run();
    },
    setClientLocale: (uuid, locale) => {
      db.update(players)
        .set({ clientLocale: locale })
        .where(eq(players.uuid, normalUuid(uuid)))
        .run();
    },
    setRole: (uuid, roleId) => {
      db.update(players)
        .set({ roleId })
        .where(eq(players.uuid, normalUuid(uuid)))
        .run();
    },
    roleOf: (uuid) => {
      const id = normalUuid(uuid);
      const own = get(id)?.roleId;
      const team = db
        .select()
        .from(teamMembers)
        .where(isNotNull(teamMembers.minecraftUuid))
        .all()
        .filter((m) => m.minecraftUuid && normalUuid(m.minecraftUuid) === id)
        .map((m) => m.roleId);
      const candidates = [own, ...team]
        .map((roleId) => (roleId ? stores.role(roleId) : undefined))
        .filter((r): r is Role => Boolean(r))
        .sort((a, b) => a.position - b.position);
      return candidates[0] ?? fallback();
    },
  };
}
