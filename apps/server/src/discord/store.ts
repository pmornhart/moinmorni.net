import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { discordObjects } from '../db/schema.js';

/**
 * Was der Bot in Discord kennt: Schlüssel (z. B. „ch:rules“, „role:moderator“, „msg:status“) → Discord-ID, dazu ob er
 * es selbst angelegt hat und was er zuletzt gesetzt hat. So legt ein neues Einrichten nichts doppelt an, löscht nur
 * Eigenes und lässt stehen, was jemand in Discord selbst geändert hat.
 */

export interface StoredObject {
  readonly id: string;
  readonly created: boolean;
  readonly applied: Readonly<Record<string, unknown>> | null;
}

export interface DiscordStore {
  readonly get: (key: string) => string | null;
  readonly entry: (key: string) => StoredObject | null;
  /** Merken; `created` bleibt wahr, wenn es einmal wahr war. `applied` ersetzt das bisher Gemerkte. */
  readonly put: (
    key: string,
    id: string,
    extra?: { readonly created?: boolean; readonly applied?: Record<string, unknown> | null },
  ) => void;
  readonly drop: (key: string) => void;
  /** Alle Einträge mit diesem Anfang (z. B. „ch:voice-“). */
  readonly withPrefix: (
    prefix: string,
  ) => Array<{ readonly key: string; readonly id: string; readonly created: boolean }>;
}

export function createDiscordStore(db: Db): DiscordStore {
  const entry = (key: string): StoredObject | null => {
    const row = db.select().from(discordObjects).where(eq(discordObjects.key, key)).get();
    return row ? { id: row.discordId, created: row.created, applied: row.applied ?? null } : null;
  };
  return {
    get: (key) => entry(key)?.id ?? null,
    entry,
    put: (key, id, extra = {}) => {
      const before = entry(key);
      const created = Boolean(extra.created) || (before?.id === id && before.created);
      const applied = extra.applied === undefined ? (before?.applied ?? null) : extra.applied;
      const values = {
        discordId: id,
        created,
        applied: applied ? { ...applied } : null,
        updatedAt: new Date().toISOString(),
      };
      db.insert(discordObjects)
        .values({ key, ...values })
        .onConflictDoUpdate({ target: discordObjects.key, set: values })
        .run();
    },
    drop: (key) => {
      db.delete(discordObjects).where(eq(discordObjects.key, key)).run();
    },
    // Wenige Dutzend Zeilen – im Speicher filtern statt LIKE (Schlüssel enthalten „_“, das in LIKE ein Platzhalter ist).
    withPrefix: (prefix) =>
      db
        .select()
        .from(discordObjects)
        .all()
        .filter((r) => r.key.startsWith(prefix))
        .map((r) => ({ key: r.key, id: r.discordId, created: r.created })),
  };
}
