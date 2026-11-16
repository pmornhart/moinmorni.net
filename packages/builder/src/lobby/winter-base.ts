/* eslint-disable ts-patterns/no-magic-numbers -- a decoration plan: positions, sizes and block lists as the lobby needs them */
/**
 * Gemeinsames für die Winter-Saison (`winter.ts`, `christbaum.ts`, `weihnachtsmarkt.ts`): wie der Winter die Welt
 * sieht (Bauplan + was er schon gesetzt hat), was oben auf einer Säule liegt (und ob Schnee darauf kommt), Tags der
 * Winter-Deko.
 */
import { baseName, isFragile, type Canvas } from '../canvas.js';
import { GROUND } from '../nature.js';

export const HALF = 0.5;
/** Erste Luftschicht über dem Boden der Grundwelt. */
export const BASE = GROUND + 1;
/**
 * Innen (das Dorf mit Schloss, x und z von −128 bis 127) liegt der Schnee Stelle für Stelle; außen bis an die Kante
 * des Geländes (±223, so weit räumt der Bau die Welt) wird Gras an den Bergen zu Schneeblöcken.
 */
export const INNER = { from: -128, to: 127 } as const;

/** Tags der Winter-Deko: Saison + Art (für Tests und zum Nachsehen im Spiel). */
export const tags = (kind: string): string => `Tags:['mm_season','mm_season_winter','mm_winter_${kind}']`;

export type Change = readonly [number, number, number, string];

/** Grundwelt unter dem Bauplan (`clearCommands`): Gras auf 64, darunter Erde und Stein, darüber Luft. */
export function ground(y: number): string {
  if (y > GROUND) return 'air';
  if (y === GROUND) return 'grass_block';
  return y > GROUND - 4 ? 'dirt' : 'stone';
}

export interface View {
  /** Block vor dem Winter (Bauplan der Lobby oder Grundwelt). */
  readonly before: (x: number, y: number, z: number) => string;
  /** Block mit dem, was der Winter schon gesetzt hat. */
  readonly now: (x: number, y: number, z: number) => string;
}

export function viewOf(base: Canvas, w: Canvas): View {
  const before = (x: number, y: number, z: number): string => base.get(x, y, z) ?? ground(y);
  return { before, now: (x, y, z) => w.get(x, y, z) ?? before(x, y, z) };
}

// ---------- Was wo liegen bleibt ----------

export type Kind = 'ground' | 'leaves' | 'solid' | 'plant' | 'water' | 'skip';

/** Natürlicher Boden: hier liegt der Schnee tiefer und mit Verwehungen. */
const NATURAL: ReadonlySet<string> = new Set([
  'grass_block',
  'dirt',
  'podzol',
  'rooted_dirt',
  'moss_block',
  'mycelium',
  'mud',
  'farmland',
  'clay',
  'sand',
  'red_sand',
]);
/** Pflanzen, die im Winter unter dem Schnee verschwinden (dazu alle Tulpen und Augenblüten). */
const PLANTS: ReadonlySet<string> = new Set([
  'short_grass',
  'tall_grass',
  'fern',
  'large_fern',
  'dandelion',
  'poppy',
  'blue_orchid',
  'allium',
  'azure_bluet',
  'oxeye_daisy',
  'cornflower',
  'lily_of_the_valley',
  'sunflower',
  'lilac',
  'rose_bush',
  'peony',
  'dead_bush',
  'wheat',
  'carrots',
  'potatoes',
  'beetroots',
  'sugar_cane',
  'pink_petals',
  'wildflowers',
  'leaf_litter',
  'bush',
  'firefly_bush',
  'short_dry_grass',
  'tall_dry_grass',
  'torchflower',
  'sweet_berry_bush',
]);
/** Blumen nach Endung: „red_tulip“, „open_eyeblossom“ (aber nicht „potted_red_tulip“ – Töpfe beginnen mit potted_). */
const PLANT_ENDINGS: readonly string[] = ['_tulip', '_eyeblossom'];
const isPlant = (name: string): boolean =>
  PLANTS.has(name) || (!name.startsWith('potted_') && PLANT_ENDINGS.some((e) => name.endsWith(e)));
/** Möbel aus dem Ressourcenpaket (`furniture.ts`) – das Modell sitzt anders als der Block, darauf kein Schnee. */
const FURNITURE: ReadonlySet<string> = new Set(['mangrove_slab', 'birch_slab']);
/** Blöcke ohne volle Oberseite (oder Schmuck): darauf liegt kein Schnee – wie in Minecraft. */
const NOT_FULL: readonly string[] = [
  'stairs',
  'fence',
  '_wall',
  'pane',
  'bars',
  'door',
  'button',
  'pressure_plate',
  'sign',
  'banner',
  'carpet',
  'rail',
  'torch',
  'lantern',
  'candle',
  'chain',
  '_rod',
  'pot',
  'head',
  'skull',
  'bell',
  'campfire',
  'cake',
  '_bed',
  'chest',
  'anvil',
  'grindstone',
  'lectern',
  'brewing_stand',
  'cauldron',
  'composter',
  'hopper',
  'scaffolding',
  'ladder',
  'vine',
  'lever',
  'cobweb',
  'cactus',
  'bamboo',
  'dripstone',
  'cluster',
  '_bud',
  'coral',
  'pickle',
  'conduit',
  'enchanting_table',
  'daylight_detector',
  'stonecutter',
  'lily_pad',
  'kelp',
  'seagrass',
  'tripwire',
  'repeater',
  'comparator',
  'redstone_wire',
  'egg',
  'beacon',
  'end_portal_frame',
  'snow',
  'ice',
  'barrier',
  'structure_void',
  'light',
  'lava',
];

/** Was oben auf einer Säule liegt – und damit, ob und wie viel Schnee darauf kommt. */
export function kindOf(block: string): Kind {
  const name = baseName(block);
  if (NATURAL.has(name)) return 'ground';
  if (isPlant(name)) return 'plant';
  if (name === 'water') return block === 'water' || block.includes('level=0') ? 'water' : 'skip';
  if (name.endsWith('_leaves')) return 'leaves';
  if (FURNITURE.has(name) || NOT_FULL.some((part) => name.includes(part)) || isFragile(block)) return 'skip';
  if (name.endsWith('_slab'))
    return block.includes('type=top') || block.includes('type=double') ? 'solid' : 'skip';
  if (name.endsWith('_trapdoor'))
    return block.includes('half=top') && !block.includes('open=true') ? 'solid' : 'skip';
  return 'solid';
}

/** Schneeschicht als Block (1 = dünn, ohne Höhe – darauf läuft man wie auf dem Weg darunter). */
export const snowLayer = (layers: number): string => `snow[layers=${layers}]`;

export const inArea = (x: number, z: number): boolean =>
  x >= INNER.from && x <= INNER.to && z >= INNER.from && z <= INNER.to;
/** Licht-Blöcke sind unsichtbar – sie zählen für den Schnee nicht. */
export const occupies = (block: string): boolean => block !== 'air' && baseName(block) !== 'light';

/** Pflanzen in einer Säule ab Bodenhöhe wegräumen (für Bauten auf der Wiese). */
export function clearPlants(w: Canvas, v: View, x: number, z: number): void {
  [BASE, BASE + 1].filter((y) => kindOf(v.now(x, y, z)) === 'plant').forEach((y) => w.set(x, y, z, 'air'));
}
