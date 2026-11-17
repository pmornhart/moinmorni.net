/** Natur: Gelände mit Bergen und Schnee, Seen, Nadel- und Laubbäume, Blumenwiesen. */
import type { Canvas } from './canvas.js';
import { fbm, pick } from './noise.js';
import { pairs, range } from './range.js';
import { ellipsoid } from './shapes.js';

/** Oberkante der flachen Grundwelt (Gras auf y = 64). */
export const GROUND = 64;
const STEEP = 2;
/** Ab dieser Höhe über der Grundwelt ist Gras selten (Fels, Geröll). */
const ALPINE = 52;
const SNOW_JITTER = 6;
const SNOW_NOISE_SCALE = 18;
const DIRT_DEPTH = 2;
const ROCK_MIX = 0.35;
const OCTAVES = 2;
const TREE_TRUNK_SHARE = 0.55;
const CROWN_STRETCH = 0.8;
const CROWN_LOBES = 3;
const LOBE_SHIFT = 0.6;
const LOBE_SIZE = 0.7;
const SPRUCE_TOP = 2;
const SPRUCE_STEP = 2;
const SPRUCE_BASE = 0.3;
const SPRUCE_TAPER = 0.85;
const CENTER = 0.5;
const TWICE = 2;
const SNOW_SEED_OFFSET = 7;

export type Height = (x: number, z: number) => number;

/** Herkunft für die Bauplan-Prüfung (`Canvas.tagged`): Gelände und Bäume; alles andere gilt als gebaut. */
export const ORIGIN = { terrain: 'gelaende', tree: 'baum' } as const;

export interface TerrainSpec {
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
  readonly height: Height;
  readonly snowLine?: number;
  readonly waterLevel?: number;
  readonly seed?: number;
  /** Boden am See-Grund. */
  readonly lakeBed?: readonly string[];
  /** Überschreibt den Oberflächenblock (z. B. Weg); null = normal. */
  readonly surface?: (x: number, z: number, h: number) => string | null;
  /** Säulen auf Höhe der Grundwelt (Gras auf 64) auslassen – die Welt hat sie schon. */
  readonly skipFlat?: boolean;
}

const ROCKS = ['stone', 'stone', 'andesite', 'cobblestone', 'tuff'] as const;
const LAKE_BED = ['gravel', 'sand', 'clay', 'gravel'] as const;

/** Oberfläche einer Säule: See-Grund, Schnee, Fels oder Gras. */
function surfaceBlock(s: {
  underWater: boolean;
  snowy: boolean;
  bare: boolean;
  rock: string;
  bed: string;
}): string {
  if (s.underWater) return s.bed;
  if (s.snowy) return 'snow_block';
  return s.bare ? s.rock : 'grass_block';
}

/** Füllung unter der Oberfläche: Erde unter Gras, darunter Stein. */
function fillBlock(depth: number, top: string, rock: string): string {
  if (depth <= DIRT_DEPTH && top === 'grass_block') return 'dirt';
  return depth > DIRT_DEPTH + 1 ? 'stone' : rock;
}

/**
 * Gelände: jede Säule bekommt Oberfläche (Gras, Fels an steilen Hängen, Schnee oben) und darunter Erde/Stein bis
 * knapp unter den niedrigsten Nachbarn – so sind Felswände geschlossen, das unsichtbare Innere bleibt leer.
 */
export function terrain(c: Canvas, t: TerrainSpec): void {
  c.tagged(ORIGIN.terrain, () => drawTerrain(c, t));
}

function drawTerrain(c: Canvas, t: TerrainSpec): void {
  const seed = t.seed ?? 1;
  const snow = t.snowLine ?? Number.POSITIVE_INFINITY;
  const water = t.waterLevel ?? Number.NEGATIVE_INFINITY;
  pairs(range(t.x1, t.x2), range(t.z1, t.z2)).forEach(([x, z]) => {
    const h = Math.round(t.height(x, z));
    if (t.skipFlat && h === GROUND && !t.surface?.(x, z, h)) return;
    const around = [t.height(x + 1, z), t.height(x - 1, z), t.height(x, z + 1), t.height(x, z - 1)].map(
      Math.round,
    );
    const low = Math.min(...around, h);
    const steep = Math.max(...around.map((n) => Math.abs(n - h))) >= STEEP;
    const mix = fbm(seed + SNOW_SEED_OFFSET, x, z, SNOW_NOISE_SCALE, OCTAVES);
    const snowy = h >= snow + (mix - CENTER) * SNOW_JITTER * TWICE;
    const underWater = h < water;
    const rock = pick(() => mix, ROCKS);
    const custom = t.surface?.(x, z, h) ?? null;
    const bare =
      (steep && (mix > ROCK_MIX || h > GROUND + ALPINE / TWICE)) ||
      (h > GROUND + ALPINE && mix > ROCK_MIX / TWICE);
    const top =
      custom ?? surfaceBlock({ underWater, snowy, bare, rock, bed: pick(() => mix, t.lakeBed ?? LAKE_BED) });
    const floor = h < GROUND ? h - TWICE : GROUND - 1;
    const from = Math.max(Math.min(low, h) - 1, floor);
    range(from, h - 1).forEach((y) => c.set(x, y, z, fillBlock(h - y, top, rock)));
    c.set(x, h, z, top);
    if (snowy && !steep && !underWater && !custom) c.set(x, h + 1, z, 'snow[layers=1]');
    if (underWater) range(h + 1, water).forEach((y) => c.set(x, y, z, 'water'));
    const airFrom = underWater ? water + 1 : h + 1;
    if (airFrom <= GROUND) range(airFrom, GROUND).forEach((y) => c.set(x, y, z, 'air'));
  });
}

/** Laubbaum mit runder, unregelmäßiger Krone (wie eine Kastanie im Biergarten). */
export function roundTree(
  c: Canvas,
  x: number,
  y: number,
  z: number,
  opts: { height: number; radius: number; log?: string; leaves?: string; rnd: () => number },
): void {
  c.tagged(ORIGIN.tree, () => drawRoundTree(c, x, y, z, opts));
}

function drawRoundTree(
  c: Canvas,
  x: number,
  y: number,
  z: number,
  opts: { height: number; radius: number; log?: string; leaves?: string; rnd: () => number },
): void {
  const log = opts.log ?? 'oak_log';
  const leaves = `${opts.leaves ?? 'oak_leaves'}[persistent=true]`;
  const trunk = Math.round(opts.height * TREE_TRUNK_SHARE);
  range(y, y + trunk).forEach((ty) => c.set(x, ty, z, log));
  const cy = y + trunk + opts.radius * CROWN_STRETCH * TREE_TRUNK_SHARE;
  ellipsoid(c, x, cy, z, opts.radius, opts.radius * CROWN_STRETCH, opts.radius, leaves);
  range(1, CROWN_LOBES).forEach(() => {
    const dx = (opts.rnd() - CENTER) * opts.radius * LOBE_SHIFT * TWICE;
    const dz = (opts.rnd() - CENTER) * opts.radius * LOBE_SHIFT * TWICE;
    const r = opts.radius * LOBE_SIZE;
    ellipsoid(c, x + dx, cy + opts.rnd() * r, z + dz, r, r * CROWN_STRETCH, r, leaves);
  });
  range(y + trunk, Math.round(cy)).forEach((ty) => c.set(x, ty, z, log));
}

/** Fichte: Stamm und Kegel aus Ringen, die nach oben schmaler werden. */
export function spruce(c: Canvas, x: number, y: number, z: number, height: number): void {
  c.tagged(ORIGIN.tree, () => drawSpruce(c, x, y, z, height));
}

function drawSpruce(c: Canvas, x: number, y: number, z: number, height: number): void {
  const leaves = 'spruce_leaves[persistent=true]';
  range(y, y + height - SPRUCE_TOP).forEach((ty) => c.set(x, ty, z, 'spruce_log'));
  const crownStart = y + Math.round(height * SPRUCE_BASE);
  const maxR = Math.max(1, Math.round(height / (SPRUCE_STEP * TWICE)));
  range(crownStart, y + height).forEach((ty) => {
    const t = (ty - crownStart) / Math.max(1, y + height - crownStart);
    const wave = (ty - crownStart) % SPRUCE_STEP === 0 ? 1 : SPRUCE_TAPER;
    const r = Math.max(0, Math.round(maxR * (1 - t) * wave));
    pairs(range(-r, r), range(-r, r))
      .filter(([dx, dz]) => Math.abs(dx) + Math.abs(dz) <= r + (r > 1 ? 1 : 0))
      .forEach(([dx, dz]) => c.soft(x + dx, ty, z + dz, leaves));
  });
  c.set(x, y + height, z, leaves);
  c.set(x, y + height + 1, z, leaves);
}

const MEADOW = [
  'short_grass',
  'short_grass',
  'short_grass',
  'short_grass',
  'tall_grass[half=lower]',
  'dandelion',
  'poppy',
  'cornflower',
  'azure_bluet',
  'oxeye_daisy',
  'allium',
  'white_tulip',
  'pink_tulip',
  'blue_orchid',
] as const;

/** Blumenwiese auf Grasblöcken: `density` = Anteil bewachsener Felder. */
export function meadow(
  c: Canvas,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  height: Height,
  density: number,
  rnd: () => number,
  flowers: readonly string[] = MEADOW,
  only: (x: number, z: number) => boolean = () => true,
): void {
  c.tagged(ORIGIN.terrain, () =>
    pairs(range(x1, x2), range(z1, z2)).forEach(([x, z]) => {
      if (!only(x, z) || rnd() > density) return;
      const h = Math.round(height(x, z));
      const ground = c.get(x, h, z) ?? (h === GROUND ? 'grass_block' : undefined);
      if (ground !== 'grass_block' || c.get(x, h + 1, z) !== undefined) return;
      const plant = pick(rnd, flowers);
      c.set(x, h + 1, z, plant);
      if (plant.startsWith('tall_grass')) c.set(x, h + TWICE, z, 'tall_grass[half=upper]');
    }),
  );
}
