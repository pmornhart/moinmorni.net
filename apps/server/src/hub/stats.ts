import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { modeStats, players } from '../db/schema.js';
import { MODE_HEADLINE_STATS } from '@morninet/shared';
import { normalUuid } from './players.js';

/**
 * Statistiken der Spielmodi. Ein Modus-Server meldet über den Hub, was in einer Runde passiert ist – nur für seinen
 * eigenen Modus (der Hub prüft, dass der Server zum Modus gehört). Werte sind ganze Zahlen:
 *
 * - `add`: hochzählen (Siege, Niederlagen, Kills, gespielte Runden …)
 * - `set`: setzen (z. B. Wertung)
 * - `max`/`min`: nur übernehmen, wenn besser (Bestwert, Bestzeit in Millisekunden)
 */

/** Namen von Werten: klein, Ziffern, Unterstrich, z. B. "wins", "best_time_ms". */
// https://regex101.com/?flavor=javascript&regex=%5E%5Ba-z%5D%5Ba-z0-9_%5D%7B0%2C31%7D%24&testString=best_time_ms
const KEY = /^[a-z][a-z0-9_]{0,31}$/;
const MAX_KEYS = 32;
/** Größter Betrag eines Werts (reicht für Millisekunden über Jahre). */
const LIMIT = 1e12;
const MODE_MAX = 32;
const UUID_MIN = 32;
const UUID_MAX = 36;
const value = z.number().int().min(-LIMIT).max(LIMIT);
const values = z
  .record(z.string().regex(KEY), value)
  .refine((r) => Object.keys(r).length <= MAX_KEYS, 'too many values');

export const statsSchema = z.object({
  mode: z.string().min(1).max(MODE_MAX),
  uuid: z.string().min(UUID_MIN).max(UUID_MAX),
  add: values.optional(),
  set: values.optional(),
  max: values.optional(),
  min: values.optional(),
});
export type StatsReport = z.infer<typeof statsSchema>;

export interface TopEntry {
  readonly rank: number;
  readonly uuid: string;
  readonly name: string;
  readonly value: number;
}

/** Welche Werte ein Modus meldet und wie viele (öffentliche) Spieler einen haben – für Bestenlisten der Webseite. */
export interface ModeBoard {
  readonly mode: string;
  readonly keys: ReadonlyArray<{
    readonly key: string;
    readonly players: number;
    readonly order: 'asc' | 'desc';
  }>;
}

/** Zeiten (…_ms) sind besser, je kleiner sie sind. */
const TIME_SUFFIX = '_ms';
/** Diese Werte stehen in einer Bestenliste vorne (wenn ein Modus sie meldet), der Rest nach dem Alphabet. */
const HEADLINE_KEYS = ['rating', 'wins', 'balance', 'finishes', 'points', 'best_wave', 'kills', 'games'];
/** Rang eines Werts in der Bestenliste: der eigene wichtigste Wert des Modus ganz vorne, dann die üblichen. */
const rankOfKey = (mode: string, key: string): number => {
  if (MODE_HEADLINE_STATS[mode] === key) return -1;
  const i = HEADLINE_KEYS.indexOf(key);
  return i < 0 ? HEADLINE_KEYS.length : i;
};

export interface ModeStatsService {
  readonly record: (report: StatsReport) => void;
  /** Rangliste eines Werts (ohne private Profile); `lowFirst` für Zeiten. */
  readonly top: (mode: string, key: string, limit: number, lowFirst?: boolean) => TopEntry[];
  /** Alle Werte eines Spielers, nach Modus. */
  readonly ofPlayer: (uuid: string) => Record<string, Record<string, number>>;
  /** Je Modus die gemeldeten Werte (nur öffentliche Profile gezählt), wichtige zuerst. */
  readonly boards: () => ModeBoard[];
}

export function createModeStats(db: Db): ModeStatsService {
  const upsert = (
    mode: string,
    uuid: string,
    key: string,
    next: (old: number | null) => number | null,
  ): void => {
    const old = db
      .select({ value: modeStats.value })
      .from(modeStats)
      .where(and(eq(modeStats.mode, mode), eq(modeStats.uuid, uuid), eq(modeStats.key, key)))
      .get();
    const fresh = next(old ? old.value : null);
    if (fresh === null) return;
    db.insert(modeStats)
      .values({ mode, uuid, key, value: fresh })
      .onConflictDoUpdate({
        target: [modeStats.mode, modeStats.uuid, modeStats.key],
        set: { value: fresh, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` },
      })
      .run();
  };
  const each = (r: Record<string, number> | undefined, fn: (key: string, v: number) => void): void =>
    Object.entries(r ?? {}).forEach(([k, v]) => fn(k, v));

  return {
    record: (report) => {
      const uuid = normalUuid(report.uuid);
      db.transaction(() => {
        each(report.add, (k, v) => upsert(report.mode, uuid, k, (old) => (old ?? 0) + v));
        each(report.set, (k, v) => upsert(report.mode, uuid, k, () => v));
        each(report.max, (k, v) =>
          upsert(report.mode, uuid, k, (old) => (old === null || v > old ? v : null)),
        );
        each(report.min, (k, v) =>
          upsert(report.mode, uuid, k, (old) => (old === null || v < old ? v : null)),
        );
      });
    },
    top: (mode, key, limit, lowFirst = false) =>
      db
        .select({ uuid: modeStats.uuid, value: modeStats.value, name: players.name })
        .from(modeStats)
        .innerJoin(players, eq(players.uuid, modeStats.uuid))
        .where(and(eq(modeStats.mode, mode), eq(modeStats.key, key), eq(players.privateProfile, false)))
        .orderBy(lowFirst ? modeStats.value : desc(modeStats.value))
        .limit(limit)
        .all()
        .map((r, i) => ({ rank: i + 1, uuid: r.uuid, name: r.name, value: r.value })),
    ofPlayer: (uuid) =>
      db
        .select()
        .from(modeStats)
        .where(eq(modeStats.uuid, normalUuid(uuid)))
        .all()
        .reduce<Record<string, Record<string, number>>>(
          (acc, r) => ({ ...acc, [r.mode]: { ...(acc[r.mode] ?? {}), [r.key]: r.value } }),
          {},
        ),
    boards: () => {
      const rows = db
        .select({ mode: modeStats.mode, key: modeStats.key, players: sql<number>`count(*)` })
        .from(modeStats)
        .innerJoin(players, eq(players.uuid, modeStats.uuid))
        .where(eq(players.privateProfile, false))
        .groupBy(modeStats.mode, modeStats.key)
        .all();
      const byMode = rows.reduce<Map<string, ModeBoard['keys']>>(
        (acc, r) =>
          new Map(acc).set(r.mode, [
            ...(acc.get(r.mode) ?? []),
            { key: r.key, players: r.players, order: r.key.endsWith(TIME_SUFFIX) ? 'asc' : 'desc' },
          ]),
        new Map(),
      );
      return [...byMode].map(([mode, keys]) => ({
        mode,
        keys: [...keys].sort(
          (a, b) => rankOfKey(mode, a.key) - rankOfKey(mode, b.key) || a.key.localeCompare(b.key),
        ),
      }));
    },
  };
}
