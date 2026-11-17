import { lobbyPackEntries, packMeta } from './furniture.js';
import { angelPackEntries, packIcon, type FishPackEntry } from './fische/paket.js';
import type { ClothingPackEntry } from './kleidung/paket.js';
import { zipOf, type ZipEntry } from './png.js';

/**
 * Das Netzwerk-Paket: ein Ressourcenpaket für das ganze Netzwerk. Der Proxy bietet es einmal beim Betreten an, danach
 * bleibt es auf jedem Server – kein Laden mehr beim Wechsel zwischen Lobby und Spielmodi („einfach schnips“).
 *
 * Drin: Möbel, Trachten, Brunnen, Christbaumkugeln und Ostereier der Lobby (`furniture.ts`), Fische und Kleidung aus
 * Angelkönig (`fische/`, `kleidung/`) und die Lobbymusik (Klangdateien, `musik/paket.ts`). Nicht drin: die
 * Rang-Abzeichen – sie hängen an den Rollen im Panel und kommen als eigenes kleines Paket (eine neue Rolle lädt dann
 * nur das kleine Paket neu, nicht die Musik).
 *
 * Wichtig, weil es überall gilt: Kein normaler Block und kein normaler Gegenstand sieht mit dem Paket anders aus.
 * Alles hängt an Gegenständen mit unserem Namen in `custom_model_data` (oder am leeren Luft-Modell), die es nur in
 * Anzeigen der Lobby bzw. bei Angelkönig gibt. Ein Test prüft, dass das Paket keine Blockzustände enthält.
 */

/** Feste Kennung des Netzwerk-Pakets („moinmorni-netzp“ als Bytes). Gleicher Wert in `BadgePack.java`. */
export const NETZ_PACK_ID = '6d6f696e-6d6f-726e-692d-6e65747a7061';

export interface NetzPackParts {
  readonly fish: readonly FishPackEntry[];
  readonly clothes: readonly ClothingPackEntry[];
  /** Weitere Dateien (Lobbymusik). */
  readonly extra?: readonly ZipEntry[];
}

const ITEMS_DIR = 'assets/minecraft/items/';

interface SelectItem {
  readonly model: {
    readonly type: string;
    readonly property?: string;
    readonly index?: number;
    readonly cases?: readonly unknown[];
    readonly fallback?: unknown;
  };
}

/**
 * Zwei Teile wollen denselben Gegenstand ändern: beide Auswahlen zusammenlegen (gleiche Eigenschaft, gleiche Stelle,
 * gleicher Rückfall). Passt das nicht, ist das ein Fehler beim Bauen – lieber laut als ein still kaputtes Paket.
 */
function mergeItem(name: string, a: Buffer, b: Buffer): Buffer {
  const x = JSON.parse(a.toString()) as SelectItem;
  const y = JSON.parse(b.toString()) as SelectItem;
  const same =
    x.model.type === 'minecraft:select' &&
    y.model.type === 'minecraft:select' &&
    x.model.property === y.model.property &&
    x.model.index === y.model.index &&
    JSON.stringify(x.model.fallback) === JSON.stringify(y.model.fallback);
  if (!same) throw new Error(`Netzwerk-Paket: ${name} passt nicht zusammen`);
  const merged = { model: { ...x.model, cases: [...(x.model.cases ?? []), ...(y.model.cases ?? [])] } };
  return Buffer.from(`${JSON.stringify(merged, null, 2)}\n`);
}

/** Dateien zusammenlegen; doppelte Gegenstände werden verbunden, andere doppelte Dateien sind ein Fehler. */
export function mergeEntries(parts: readonly (readonly ZipEntry[])[]): ZipEntry[] {
  const byName = new Map<string, ZipEntry>();
  parts.flat().forEach((e) => {
    const known = byName.get(e.name);
    if (!known) {
      byName.set(e.name, e);
      return;
    }
    if (!e.name.startsWith(ITEMS_DIR)) throw new Error(`Netzwerk-Paket: ${e.name} kommt doppelt vor`);
    byName.set(e.name, { name: e.name, data: mergeItem(e.name, known.data, e.data) });
  });
  return [...byName.values()];
}

/** Das Netzwerk-Paket als ZIP – gleicher Inhalt = gleiche Bytes = gleiche SHA-1 (Minecraft lädt nur dann neu). */
export function netzPack(parts: NetzPackParts): Buffer {
  return zipOf([
    packMeta('MoinMorni – Möbel, Brunnen, Trachten, Fische, Kleidung und Blasmusik'),
    ...packIcon(),
    ...mergeEntries([lobbyPackEntries(), angelPackEntries(parts.fish, parts.clothes), parts.extra ?? []]),
  ]);
}
