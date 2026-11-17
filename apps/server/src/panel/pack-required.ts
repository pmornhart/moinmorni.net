import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { settingValues } from '../db/schema.js';

/**
 * „Ein Paket fürs ganze Netzwerk“: Statt „Möbel-Paket verpflichtend“ (Lobby) und „Abzeichen-Paket verpflichtend“
 * gibt es einen Schalter, Netzwerk → Ressourcenpaket → `packRequired`. War vorher einer der beiden an, ist der neue
 * einmal an (Merker in `setting_values` unter `_paket`, keine Migration). Was danach im Panel steht, bleibt.
 */
const MARKER_AREA = '_paket';
const MARKER_KEY = 'pflicht-zusammen';
const BY = 'moinmorni';

const stored = (db: Db, area: string, key: string): unknown =>
  db
    .select()
    .from(settingValues)
    .where(and(eq(settingValues.area, area), eq(settingValues.key, key)))
    .get()?.value;

/** true = der neue Schalter wurde dabei angeschaltet. */
export function mergePackRequired(db: Db): boolean {
  if (stored(db, MARKER_AREA, MARKER_KEY) !== undefined) return false;
  const at = new Date().toISOString();
  const was = stored(db, 'lobby', 'packRequired') === true || stored(db, 'badges', 'required') === true;
  const turnOn = was && stored(db, 'network', 'packRequired') === undefined;
  db.transaction((tx) => {
    if (turnOn) {
      tx.insert(settingValues)
        .values({ area: 'network', key: 'packRequired', value: true, updatedBy: BY, updatedAt: at })
        .onConflictDoNothing()
        .run();
    }
    tx.insert(settingValues)
      .values({ area: MARKER_AREA, key: MARKER_KEY, value: at, updatedBy: BY, updatedAt: at })
      .onConflictDoNothing()
      .run();
  });
  return turnOn;
}
