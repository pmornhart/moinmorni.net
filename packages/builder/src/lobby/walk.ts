/* eslint-disable ts-patterns/no-magic-numbers -- Minecraft's block shapes in sixteenths of a block */
/**
 * Zu Fuß erreichbar? Wertet den fertigen Bauplan der Lobby aus – ohne Server: Wo kann man stehen, und wohin kommt man
 * vom Ankunftspunkt aus zu Fuß? Die Regeln sind die des Spiels:
 * - Stehen: fester Boden unten, darüber 1,8 Blöcke frei (so groß ist ein Spieler).
 * - Nach oben höchstens 1 Block auf einmal. Stufen und Treppen zählen mit ihrer echten Höhe (eine Stufe ist ½ Block,
 *   eine Treppe hat vorne eine halbe Stufe), Zäune und Mauern sind 1½ Blöcke hoch – zu hoch. Mehr als 0,6 Blöcke
 *   hinauf geht nur mit einem Sprung (der wird gezählt), dafür braucht man Platz über dem Kopf. Nach unten geht es
 *   beliebig weit (in der Lobby gibt es keinen Fallschaden).
 * - Türen, Zauntore und Falltüren gehen auf (das Lobby-Plugin erlaubt das jedem), Leitern und Gerüste klettert man
 *   hinauf und hinunter.
 * - Blumen, Gras, Schilder, Banner, Knöpfe, Licht und Wasser stören nicht; Teppich und Schnee sind dünne Böden.
 * Gerechnet wird in Sechzehntel-Blöcken (so fein sind Minecrafts Formen). Unter dem Bauplan liegt die flache
 * Grundwelt (Gras auf 64): Was der Plan nicht setzt, ist dort Erde, darüber Luft.
 *
 * Die Bauten melden ihre Räume und Plätze (`Canvas.place`); `walkReport` sagt für jeden, ob man hinkommt und wie oft
 * man dafür springen muss, und findet zusätzlich jeden anderen Boden, den man nicht erreicht.
 */
import type { Canvas, Place } from '../canvas.js';
import { baseName } from '../canvas.js';
import { GROUND } from '../nature.js';
import { range } from '../range.js';
import { OPPOSITE, STEP as DIRECTION, type Facing } from '../shapes.js';
import type { LobbyPoint } from './features.js';

/** Sechzehntel pro Block. */
const PX = 16;
/** Ein Spieler ist 1,8 Blöcke groß (28,8 Sechzehntel – es braucht 29). */
const BODY = 29;
/** Höchstens einen Block hinauf (mit Sprung); bis 0,6 Blöcke steigt man ohne Sprung. */
const CLIMB_MAX = PX;
const STEP_UP = 9;
/** Halbe Stufe vorne an einer Treppe. */
const HALF = 8;
/** Darunter gilt alles als fester Boden (tiefer baut die Lobby nicht). */
const LOWEST = 40;
/** Weltgrenze der Lobby: 400 Blöcke um die Mitte. */
export const WORLD_EDGE = 200;
const COLUMN_SPAN = 1024;
const COLUMN_OFFSET = 512;
/** Höhe in Sechzehnteln passt in 13 Bit (bis Bauhöhe 320). */
const HEIGHT_SPAN = 8192;
const FOUR_WAYS: readonly Facing[] = ['north', 'south', 'east', 'west'];
/** Boden, den der Plan nicht setzt (flache Grundwelt). */
export const BASE_GROUND = 'grundwelt';

/** Woraus ein Block für die Füße besteht. */
type Shape =
  | { readonly kind: 'open' }
  | { readonly kind: 'climb' }
  | { readonly kind: 'solid'; readonly lo: number; readonly hi: number };

const OPEN: Shape = { kind: 'open' };
const CLIMB: Shape = { kind: 'climb' };
const solid = (lo: number, hi: number): Shape => ({ kind: 'solid', lo, hi });
const FULL = solid(0, PX);

/** Kein Hindernis (Name ohne Zustand). */
const NO_COLLISION: ReadonlySet<string> = new Set([
  'air',
  'cave_air',
  'void_air',
  'light',
  'water',
  'lava',
  'bubble_column',
  'cobweb',
  'powder_snow',
  'structure_void',
  'fire',
  'soul_fire',
  'short_grass',
  'tall_grass',
  'fern',
  'large_fern',
  'sugar_cane',
  'wheat',
  'carrots',
  'potatoes',
  'beetroots',
  'sweet_berry_bush',
  'bush',
  'firefly_bush',
  'dead_bush',
  'leaf_litter',
  'pink_petals',
  'wildflowers',
  'glow_lichen',
  'sculk_vein',
  'hanging_roots',
  'spore_blossom',
  'seagrass',
  'tall_seagrass',
  'kelp',
  'kelp_plant',
  'redstone_wire',
  'tripwire',
  'tripwire_hook',
  'lever',
  'nether_portal',
  'end_portal',
]);
/** Teile von Namen ohne Hindernis: Blumen, Setzlinge, Fackeln, Schilder, Banner, Knöpfe, Druckplatten, Schienen. */
const NO_COLLISION_PARTS: readonly string[] = [
  'tulip',
  'poppy',
  'dandelion',
  'orchid',
  'allium',
  'azure_bluet',
  'oxeye_daisy',
  'cornflower',
  'lily_of_the_valley',
  'wither_rose',
  'rose_bush',
  'peony',
  'lilac',
  'sunflower',
  'torchflower',
  'sapling',
  'torch',
  'sign',
  'banner',
  'button',
  'pressure_plate',
  'rail',
];
/** Klettern: Leitern, Ranken, Gerüste. */
const CLIMBABLE: ReadonlySet<string> = new Set([
  'ladder',
  'vine',
  'scaffolding',
  'weeping_vines',
  'weeping_vines_plant',
  'twisting_vines',
  'twisting_vines_plant',
  'cave_vines',
  'cave_vines_plant',
]);
/** Geht nicht von Hand auf. */
const LOCKED: ReadonlySet<string> = new Set(['iron_door', 'iron_trapdoor']);
/** Niedrige Blöcke: Oberkante in Sechzehnteln (Minecrafts Kollisionsformen). */
const LOW: Readonly<Record<string, number>> = {
  chest: 14,
  trapped_chest: 14,
  ender_chest: 14,
  cake: 8,
  candle_cake: 8,
  flower_pot: 6,
  campfire: 7,
  soul_campfire: 7,
  stonecutter: 9,
  lectern: 14,
  brewing_stand: 14,
  enchanting_table: 12,
  farmland: 15,
  dirt_path: 15,
  soul_sand: 14,
  mud: 14,
  honey_block: 15,
  daylight_detector: 6,
  sea_pickle: 7,
  turtle_egg: 7,
  lily_pad: 2,
  cactus: 15,
};
/** Zäune und Mauern: 1½ Blöcke hoch (darüber springt man nicht). */
const TALL = 24;

/** Wert einer Eigenschaft im Blockzustand: `prop('oak_slab[type=top]', 'type')` → „top“. */
function prop(block: string, key: string): string | undefined {
  const state = block.split('[')[1]?.replace(']', '') ?? '';
  return state
    .split(',')
    .map((kv) => kv.split('='))
    .find(([k]) => k === key)?.[1];
}

/** Wo der Block die Füße aufhält (Sechzehntel über seiner Unterkante). */
function shapeOf(block: string): Shape {
  const name = baseName(block);
  if (NO_COLLISION.has(name) || NO_COLLISION_PARTS.some((p) => name.includes(p))) return OPEN;
  if (CLIMBABLE.has(name)) return CLIMB;
  const opens = name.endsWith('_door') || name.endsWith('_fence_gate') || name.endsWith('_trapdoor');
  if (opens && !LOCKED.has(name)) return OPEN;
  if (name === 'iron_trapdoor') {
    if (prop(block, 'open') === 'true') return OPEN;
    return prop(block, 'half') === 'top' ? solid(13, PX) : solid(0, 3);
  }
  if (name === 'snow') {
    const layers = Number(prop(block, 'layers') ?? '1');
    return layers <= 1 ? OPEN : solid(0, (layers - 1) * 2);
  }
  if (name.endsWith('_slab')) {
    const type = prop(block, 'type') ?? 'bottom';
    if (type === 'top') return solid(HALF, PX);
    return type === 'double' ? FULL : solid(0, HALF);
  }
  if (name.endsWith('carpet')) return solid(0, 1);
  if (name.endsWith('_bed')) return solid(0, 9);
  if (name.endsWith('candle')) return solid(0, 6);
  if (name.startsWith('potted_')) return solid(0, 6);
  if (name === 'lantern' || name === 'soul_lantern')
    return prop(block, 'hanging') === 'true' ? solid(1, 10) : solid(0, 9);
  if (name.endsWith('_wall_head') || name.endsWith('_wall_skull')) return solid(4, 12);
  if (name.endsWith('_head') || name.endsWith('_skull')) return solid(0, HALF);
  if (name.endsWith('_fence') || name.endsWith('_wall')) return solid(0, TALL);
  const low = LOW[name];
  return low === undefined ? FULL : solid(0, low);
}

/** Wo der Block einen Spieler aufhält, in Blöcken über seiner Unterkante – `undefined`: gar nicht (Luft, Blumen …). */
export function collisionOf(block: string): readonly [number, number] | undefined {
  const s = shapeOf(block);
  return s.kind === 'solid' ? [s.lo / PX, s.hi / PX] : undefined;
}

/** Treppe (untere Hälfte): in welche Richtung sie hinaufführt – von dort ist vorne die halbe Stufe. */
function stairUp(block: string): Facing | undefined {
  if (!baseName(block).endsWith('_stairs') || prop(block, 'half') === 'top') return undefined;
  return prop(block, 'facing') as Facing | undefined;
}

/** Eine Stelle, an der man stehen (oder sich an der Leiter halten) kann. */
export interface Stand {
  /** Füße auf dieser Höhe, in Sechzehnteln. */
  readonly h: number;
  /** Erstes Hindernis über den Füßen (Sechzehntel), `Infinity` = freier Himmel. */
  readonly ceiling: number;
  /** Worauf man steht (Block mit Zustand, `grundwelt` = nicht vom Plan); an einer Leiter die Leiter. */
  readonly floor: string;
  /** In einer Leiter oder einem Gerüst: von hier geht es senkrecht weiter. */
  readonly climb: boolean;
  /** Man steht auf einer Treppe, die in diese Richtung hinaufführt. */
  readonly stair?: Facing;
  /** Block darüber (das erste Hindernis über dem Kopf), `air` = freier Himmel. */
  readonly roof: string;
}

/** Eine Stelle mit Spalte. */
export interface Spot extends Stand {
  readonly x: number;
  readonly z: number;
}

type Interval = [lo: number, hi: number, block: string];

/** Alle Stellen einer Spalte, von unten nach oben. */
function analyse(blocks: ReadonlyMap<number, string> | undefined): Stand[] {
  const top = Math.max(GROUND, ...(blocks ? [...blocks.keys()] : [])) + 2;
  const blockAt = (y: number): string => blocks?.get(y) ?? (y <= GROUND ? BASE_GROUND : 'air');
  const intervals: Interval[] = [[-Infinity, LOWEST * PX, BASE_GROUND]];
  const climbs: number[] = [];
  range(LOWEST, top).forEach((y) => {
    const block = blockAt(y);
    const s = block === BASE_GROUND ? FULL : shapeOf(block);
    if (s.kind === 'climb') climbs.push(y);
    if (s.kind !== 'solid') return;
    const lo = y * PX + s.lo;
    const hi = y * PX + s.hi;
    const last = intervals[intervals.length - 1] as Interval;
    if (lo > last[1]) intervals.push([lo, hi, block]);
    else if (hi >= last[1]) intervals.splice(intervals.length - 1, 1, [last[0], hi, block]);
  });
  const above = (h: number): Interval | undefined => intervals.find(([lo]) => lo >= h);
  const free = (h: number): boolean => !intervals.some(([lo, hi]) => lo < h + BODY && hi > h);
  const floors = intervals
    .map(([, hi, block], i): Stand => {
      const up = stairUp(block);
      const next = intervals[i + 1];
      return {
        h: hi,
        ceiling: next?.[0] ?? Infinity,
        roof: next?.[2] ?? 'air',
        floor: block,
        climb: false,
        ...(up ? { stair: up } : {}),
      };
    })
    .filter((s) => Number.isFinite(s.h) && s.ceiling - s.h >= BODY);
  const climbSet = new Set(climbs);
  // An der Leiter: Füße in jedem Leiter-Block, dazu oben auf der obersten (zum Aussteigen).
  const holds = climbs
    .flatMap((y) => (climbSet.has(y + 1) ? [y] : [y, y + 1]))
    .filter((y) => free(y * PX))
    .map((y): Stand => {
      const inLadder = climbSet.has(y);
      const over = above(y * PX);
      return {
        h: y * PX,
        ceiling: over?.[0] ?? Infinity,
        roof: over?.[2] ?? 'air',
        floor: blockAt(inLadder ? y : y - 1),
        climb: inLadder,
      };
    });
  const byHeight = new Map<number, Stand>();
  [...floors, ...holds].forEach((s) => {
    const known = byHeight.get(s.h);
    byHeight.set(s.h, known ? { ...known, climb: known.climb || s.climb } : s);
  });
  return [...byHeight.values()].sort((a, b) => a.h - b.h);
}

const columnKey = (x: number, z: number): number => (x + COLUMN_OFFSET) * COLUMN_SPAN + (z + COLUMN_OFFSET);
/** Schlüssel einer Stelle (Spalte + Höhe). */
export const spotKey = (x: number, z: number, h: number): number => columnKey(x, z) * HEIGHT_SPAN + h;

/** Ein Schritt: wohin, und ob man dafür springen muss. */
export interface Move {
  readonly to: Spot;
  readonly jump: boolean;
}

/** Der Bauplan als Karte zum Laufen: je Spalte die Stellen, an denen man stehen kann. */
export class WalkMap {
  private readonly blocks = new Map<number, Map<number, string>>();
  private readonly stands = new Map<number, Stand[]>();

  /** `edge`: Weltgrenze (so weit um die Mitte darf man laufen; Tests nehmen eine kleine Welt). */
  constructor(
    c: Canvas,
    readonly edge = WORLD_EDGE,
  ) {
    c.forEachBlock((x, y, z, block) => {
      const k = columnKey(x, z);
      const col = this.blocks.get(k) ?? new Map<number, string>();
      col.set(y, block);
      this.blocks.set(k, col);
    });
  }

  /** Stellen der Spalte (x, z), von unten nach oben. */
  column(x: number, z: number): readonly Stand[] {
    const k = columnKey(x, z);
    const known = this.stands.get(k);
    if (known) return known;
    const fresh = analyse(this.blocks.get(k));
    this.stands.set(k, fresh);
    return fresh;
  }

  /** Die Stelle der Spalte, deren Füße am nächsten an `y` (Blöcke) sind. */
  nearest(x: number, z: number, y: number): Spot | undefined {
    const target = y * PX;
    const best = [...this.column(x, z)].sort((a, b) => Math.abs(a.h - target) - Math.abs(b.h - target))[0];
    return best ? { ...best, x, z } : undefined;
  }

  /** Wohin man von `s` aus mit einem Schritt kommt (Nachbarspalten und an Leitern senkrecht). */
  moves(s: Spot): Move[] {
    const sideways = FOUR_WAYS.flatMap((dir) => {
      const [dx, dz] = DIRECTION[dir];
      const x = s.x + dx;
      const z = s.z + dz;
      if (x < -this.edge || x >= this.edge || z < -this.edge || z >= this.edge) return [];
      return this.column(x, z)
        .filter((t) => canStep(s, t))
        .map((t): Move => ({ to: { ...t, x, z }, jump: needsJump(s, t, dir) }));
    });
    const climbing = this.column(s.x, s.z)
      .filter((t) => (s.climb && t.h === s.h + PX) || (t.climb && t.h === s.h - PX))
      .map((t): Move => ({ to: { ...t, x: s.x, z: s.z }, jump: false }));
    return [...sideways, ...climbing];
  }
}

/** Von Stelle a in die Nachbarspalte auf Stelle b? */
function canStep(a: Stand, b: Stand): boolean {
  const up = b.h - a.h;
  if (up > CLIMB_MAX) return false;
  // Hinauf: über dem Kopf (auch noch über der alten Stelle) Platz für den Schritt bzw. Sprung.
  if (up > 0) return a.ceiling >= b.h + BODY;
  // Hinunter: die neue Spalte ist frei, bis man unten ankommt.
  return b.ceiling >= a.h + BODY;
}

/** Braucht der Schritt in Richtung `dir` einen Sprung? Treppen nimmt man von vorne und von der Seite in zwei halben Stufen. */
function needsJump(a: Stand, b: Stand, dir: Facing): boolean {
  const up = b.h - a.h;
  if (up <= STEP_UP) return false;
  const halfStep = b.stair !== undefined && dir !== OPPOSITE[b.stair] && up - HALF <= STEP_UP;
  return !halfStep;
}

/** Was man vom Startpunkt aus zu Fuß erreicht – je Stelle, wie oft man mindestens springen muss. */
export interface Reach {
  readonly start: Spot;
  /** Stelle → kleinste Zahl an Sprüngen auf dem Weg dorthin. */
  readonly jumps: ReadonlyMap<number, number>;
}

/** Suche vom Startpunkt aus: erst alles ohne Sprung, dann mit einem Sprung mehr usw. (0-1-Breitensuche). */
export function reachFrom(map: WalkMap, start: LobbyPoint): Reach {
  const x = Math.floor(start.x);
  const z = Math.floor(start.z);
  const first = map.nearest(x, z, start.y);
  if (!first) throw new Error(`Am Startpunkt ${x} ${start.y} ${z} kann man nicht stehen`);
  const jumps = new Map<number, number>();
  const keyOf = (s: Spot): number => spotKey(s.x, s.z, s.h);
  /** Alles ohne Sprung ausbreiten; Ziele, für die man springen muss, für die nächste Runde sammeln. */
  const flood = (frontier: readonly Spot[], level: number, later: Spot[]): Spot[] => {
    if (frontier.length === 0) return later;
    const next = frontier.flatMap((s) =>
      map.moves(s).flatMap(({ to, jump }) => {
        if (jumps.has(keyOf(to))) return [];
        if (jump) {
          later.push(to);
          return [];
        }
        jumps.set(keyOf(to), level);
        return [to];
      }),
    );
    return flood(next, level, later);
  };
  const round = (seeds: readonly Spot[], level: number): void => {
    const fresh = seeds.filter((s) => {
      if (jumps.has(keyOf(s))) return false;
      jumps.set(keyOf(s), level);
      return true;
    });
    if (fresh.length > 0) round(flood(fresh, level, []), level + 1);
  };
  round([first], 0);
  return { start: first, jumps };
}

/** Woraus ein Boden besteht, den man nicht erreicht. */
export type FloorKind = 'boden' | 'dach' | 'laub' | 'zaun' | 'markise' | 'deko' | 'gelaende' | 'hohlraum';

/** Warum Böden dieser Art unerreichbar sein dürfen. */
export const DECOR_REASONS: Readonly<Record<Exclude<FloorKind, 'boden'>, string>> = {
  dach: 'Dächer, Gesimse, Kuppeln und Turmhauben – nur zum Anschauen',
  laub: 'Baumkronen und Hecken',
  zaun: 'Oberkanten von Zäunen, Mauern, Geländern und Scheiben',
  markise: 'Markisen und Stoffdächer der Stände',
  deko: 'Oberseiten von Möbeln, Regalen, Lampen und Ketten',
  gelaende: 'Hänge, Wiesen und Berge abseits der Wege – Landschaft, kein Platz',
  hohlraum: 'geschlossene Hohlräume unter Schlossberg und Bergen (dort kommt niemand hin)',
};

/**
 * Bewusst unerreichbare Orte (Name wie gemeldet → Grund). Alles andere muss man zu Fuß erreichen – kommt etwas Neues
 * dazu, schlägt der Test an.
 */
export const ON_PURPOSE: Readonly<Record<string, string>> = {
  Arrestzelle: 'Gefängnis – nur das Lobby-Plugin bringt Eingesperrte hinein und wieder hinaus',
  'Parkour-Ziel': 'nur über die Sprünge des Parkours (das ist der Sinn)',
  'Brunnenbecken der Handwerkergasse': 'Wasserbecken des Brunnens hinter seiner Brüstung',
};

/** Material eines Raum- oder Platz-Bodens (sonst ist es Dach, Laub, Möbel …). */
const FLOOR_PARTS: readonly string[] = [
  '_planks',
  'polished_',
  'stone_bricks',
  'cobblestone',
  'andesite',
  'diorite',
  'gravel',
  'dirt',
  'grass_block',
  'carpet',
  '_concrete',
  'smooth_stone',
  'sand',
  'tuff_bricks',
  'mud_bricks',
  'terracotta',
  BASE_GROUND,
];
/** Natürlicher Boden der Berge. */
const NATURE: ReadonlySet<string> = new Set([
  'grass_block',
  'dirt',
  'coarse_dirt',
  'stone',
  'andesite',
  'tuff',
  'cobblestone',
  'gravel',
  'sand',
  'clay',
  'snow_block',
  'snow',
  BASE_GROUND,
]);
const ROOF_PARTS: readonly string[] = ['_stairs', '_slab', 'copper', 'smooth_quartz', 'lightning_rod'];
const FENCE_PARTS: readonly string[] = ['_fence', '_wall', '_pane', 'iron_bars'];
/** So viel Anteil reicht, damit ein Boden als Hohlraum unter Gelände zählt. */
const MOSTLY = 0.5;

/** Häufigster Wert. */
function mostCommon(values: readonly string[]): string {
  const counts = values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>());
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

/** Was für ein Boden ist das? `named` = er gehört (teilweise) zu einem gemeldeten Raum oder Platz. */
function kindOf(spots: readonly Spot[], named: boolean): FloorKind {
  const names = spots.map((s) => baseName(s.floor));
  const main = mostCommon(names);
  // Meist unter Gelände (Erde, Gras, Fels): Hohlraum im Hang, den niemand sieht.
  const underground = spots.filter((s) => NATURE.has(baseName(s.roof))).length / spots.length;
  if (underground > MOSTLY) return 'hohlraum';
  if (main.endsWith('leaves')) return 'laub';
  if (FENCE_PARTS.some((p) => main.endsWith(p))) return 'zaun';
  if (main.endsWith('wool')) return 'markise';
  if (NATURE.has(main) && !named) return 'gelaende';
  if (FLOOR_PARTS.some((p) => main.includes(p))) return 'boden';
  if (ROOF_PARTS.some((p) => main.includes(p))) return 'dach';
  return 'deko';
}

/** Ein zusammenhängender Boden, den man nicht erreicht. */
export interface LostFloor {
  /** Name des Orts (gemeldet) oder Lage. */
  readonly name: string;
  readonly kind: FloorKind;
  readonly size: number;
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
  /** Füße (Blöcke), unterste Stelle. */
  readonly y: number;
}

/** Ort in einem Satz für Berichte. */
export interface PlaceResult extends Place {
  readonly reached: boolean;
  /** Kleinste Zahl an Sprüngen auf dem Weg (nur wenn erreicht). */
  readonly jumps: number;
}

export interface WalkReport {
  /** Karte und Suche (für weitere Fragen, z. B. „wie viele Sprünge bis zu dieser Stelle?“). */
  readonly map: WalkMap;
  readonly reach: Reach;
  readonly start: Spot;
  readonly places: readonly PlaceResult[];
  /** Böden ab `minSize` Spalten, die man nicht erreicht (zusammenhängend, nach Größe). */
  readonly lost: readonly LostFloor[];
}

/** Grundfläche eines Orts (der kleinste passende gibt einem Boden den Namen). */
const area = (p: Place): number => (p.x2 - p.x1 + 1) * (p.z2 - p.z1 + 1);

/** Liegt die Stelle im Kasten des Orts (Füße auf Höhe y … y+1)? */
const inPlace = (p: Place, s: Spot): boolean =>
  s.x >= p.x1 && s.x <= p.x2 && s.z >= p.z1 && s.z <= p.z2 && s.h >= p.y * PX && s.h < (p.y + 1) * PX;

/**
 * Bericht „zu Fuß erreichbar“: jeder gemeldete Ort (erreicht? wie viele Sprünge?) und alle zusammenhängenden Böden
 * ab `minSize` Spalten, die man nicht erreicht – mit Art (Boden, Dach, Laub …) und Namen des Orts, wenn einer passt.
 */
export function walkReport(c: Canvas, start: LobbyPoint, minSize = 4): WalkReport {
  const map = new WalkMap(c);
  const reach = reachFrom(map, start);
  const spots = range(-WORLD_EDGE, WORLD_EDGE - 1).flatMap((x) =>
    range(-WORLD_EDGE, WORLD_EDGE - 1).flatMap((z) => map.column(x, z).map((s): Spot => ({ ...s, x, z }))),
  );
  const places = c.places.map((p): PlaceResult => {
    const inside = range(p.x1, p.x2).flatMap((x) =>
      range(p.z1, p.z2).flatMap((z) =>
        map
          .column(x, z)
          .map((s): Spot => ({ ...s, x, z }))
          .filter((s) => inPlace(p, s)),
      ),
    );
    const costs = inside.flatMap((s) => {
      const j = reach.jumps.get(spotKey(s.x, s.z, s.h));
      return j === undefined ? [] : [j];
    });
    return { ...p, reached: costs.length > 0, jumps: costs.length > 0 ? Math.min(...costs) : Infinity };
  });
  const lostSpots = new Map(
    spots.filter((s) => !reach.jumps.has(spotKey(s.x, s.z, s.h))).map((s) => [spotKey(s.x, s.z, s.h), s]),
  );
  const grouped = new Set<number>();
  /** Zusammenhängend: Nachbarn, zwischen denen man ohne Sprung hin und her kommt. */
  const gather = (frontier: readonly Spot[], acc: Spot[]): Spot[] => {
    if (frontier.length === 0) return acc;
    const next = frontier.flatMap((s) =>
      map.moves(s).flatMap(({ to, jump }) => {
        const k = spotKey(to.x, to.z, to.h);
        if (jump || grouped.has(k) || !lostSpots.has(k) || Math.abs(to.h - s.h) > STEP_UP) return [];
        grouped.add(k);
        return [lostSpots.get(k) as Spot];
      }),
    );
    next.forEach((s) => acc.push(s));
    return gather(next, acc);
  };
  const lost = [...lostSpots.entries()]
    .flatMap(([k, s]) => {
      if (grouped.has(k)) return [];
      grouped.add(k);
      return [gather([s], [s])];
    })
    .filter((group) => group.length >= minSize)
    .map((group): LostFloor => {
      const named = c.places
        .filter((p) => group.some((s) => inPlace(p, s)))
        .sort((a, b) => area(a) - area(b))[0];
      const xs = group.map((s) => s.x);
      const zs = group.map((s) => s.z);
      const y = Math.min(...group.map((s) => s.h)) / PX;
      const box = { x1: Math.min(...xs), z1: Math.min(...zs), x2: Math.max(...xs), z2: Math.max(...zs) };
      return {
        name: named?.name ?? `Boden bei ${box.x1}…${box.x2} / ${box.z1}…${box.z2}`,
        kind: kindOf(group, named !== undefined),
        size: group.length,
        ...box,
        y,
      };
    })
    .sort((a, b) => b.size - a.size);
  return { map, reach, start: reach.start, places, lost };
}
