/* eslint-disable ts-patterns/no-magic-numbers -- Formen der Blöcke (1/16 Block) und Abstände, wie Minecraft sie hat */
/**
 * Bauplan-Prüfung: findet im fertigen Plan alles, was im Spiel komisch aussähe – Laternen, Fackeln, Schilder, Töpfe,
 * Teppiche und Kerzen ohne Halt, Ketten ohne Ende, Türen ohne Rahmen, Bäume in Häusern, Ständen und Wegen,
 * auslaufendes Wasser, schwebende Blöcke, Figuren in Wänden und Saison-Deko in der Luft. Jeder Fund mit Koordinaten.
 *
 * Maßstab ist, was man sieht – meist genau das, was Minecraft beim Setzen von Hand verlangt: Was hängt, braucht oben
 * einen Block oder Pfosten, was steht, unten eine Fläche, was an der Wand hängt, eine Wand. Die Lobby setzt alles mit
 * `strict` (ohne Block-Updates) – darum bleibt dort auch stehen, was Minecraft sonst abwerfen würde.
 */
import type { Canvas } from './canvas.js';
import { GROUND, ORIGIN } from './nature.js';
import { range } from './range.js';
import { OPPOSITE, STEP, type Facing } from './shapes.js';

/** Welche Art Fehler. */
export type FundArt =
  | 'ohne-halt'
  | 'kette'
  | 'tuer'
  | 'baum'
  | 'wasser'
  | 'schwebt'
  | 'pflanze'
  | 'verbindung'
  | 'figur'
  | 'bau'
  | 'erde'
  | 'deko';

export interface Fund {
  readonly art: FundArt;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Block bzw. Wesen an der Stelle. */
  readonly was: string;
  /** Was nicht stimmt (für Menschen). */
  readonly text: string;
}

/** Eine Stelle in der Welt: was dort steht. */
export type World = (x: number, y: number, z: number) => string;
type Side = Facing | 'up' | 'down';

const HORIZONTAL: readonly Facing[] = ['north', 'east', 'south', 'west'];
const SIX: readonly Side[] = [...HORIZONTAL, 'up', 'down'];
const STEP3: Readonly<Record<Side, readonly [number, number, number]>> = {
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
};

// ---------------------------------------------------------------------------------------------------------------
// Formen: was ein Block nach oben, unten und zu den Seiten bietet
// ---------------------------------------------------------------------------------------------------------------

/** Wofür ein Block taugt. */
type Kind = 'luft' | 'fluessig' | 'pflanze' | 'deko' | 'teil' | 'voll';

interface Form {
  readonly kind: Kind;
  /** Etwas Kleines kann mittig darauf stehen (Laterne, Topf, Kerze, Teppich …). */
  readonly top: boolean;
  /** Etwas kann mittig darunter hängen (Laterne, Kette …). */
  readonly bottom: boolean;
  /** Fläche bis an die Seite `dir` – dort kann ein Schild, Banner, eine Leiter oder Kette anliegen. */
  readonly side: (dir: Facing) => boolean;
}

interface State {
  readonly name: string;
  readonly props: Readonly<Record<string, string>>;
}

// Blockzustand zerlegen: "spruce_door[facing=east,half=lower]" → Name "spruce_door", Eigenschaften
// "facing=east,half=lower"; ohne Klammern nur der Name.
// https://regex101.com/?flavor=javascript&regex=%5E(%3F%3Aminecraft%3A)%3F(%5Ba-z0-9_%5D%2B)(%3F%3A%5C%5B(.*)%5C%5D)%3F%24&testString=spruce_door%5Bfacing%3Deast%2Chalf%3Dlower%5D
const STATE = /^(?:minecraft:)?([a-z0-9_]+)(?:\[(.*)\])?$/;

const states = new Map<string, State>();
export function stateOf(block: string): State {
  const known = states.get(block);
  if (known) return known;
  const m = STATE.exec(block);
  const props = Object.fromEntries(
    (m?.[2] ?? '')
      .split(',')
      .filter(Boolean)
      .map((p) => p.split('=') as [string, string]),
  );
  const s = { name: m?.[1] ?? block, props };
  states.set(block, s);
  return s;
}

const ALL = (): boolean => true;
const NONE = (): boolean => false;
const form = (kind: Kind, top: boolean, bottom: boolean, side: (d: Facing) => boolean = NONE): Form => ({
  kind,
  top,
  bottom,
  side,
});
const FULL = form('voll', true, true, ALL);
const AIR = form('luft', false, false);
const FLUID = form('fluessig', false, false);
const PLANT = form('pflanze', false, false);
const DECO = form('deko', false, false);
/** Liegt unten flach auf (Teppich, Schnee, Kuchen …): braucht eine Fläche darunter. */
const FLAT = form('deko', false, true);

const AIRISH: ReadonlySet<string> = new Set(['air', 'cave_air', 'void_air', 'light', 'structure_void']);
/** Volle Blöcke, deren Name nach Deko klingt. */
const FULL_NAMES: ReadonlySet<string> = new Set([
  'sea_lantern',
  'jack_o_lantern',
  'grass_block',
  'snow_block',
  'mushroom_stem',
  'red_mushroom_block',
  'brown_mushroom_block',
  'dried_kelp_block',
  'bamboo_block',
  'stripped_bamboo_block',
  'mangrove_roots',
  'muddy_mangrove_roots',
  'rooted_dirt',
]);
/** Pflanzen (brauchen Erde darunter). */
const PLANT_NAMES: ReadonlySet<string> = new Set([
  'short_grass',
  'tall_grass',
  'fern',
  'large_fern',
  'dandelion',
  'poppy',
  'blue_orchid',
  'allium',
  'azure_bluet',
  'red_tulip',
  'orange_tulip',
  'white_tulip',
  'pink_tulip',
  'oxeye_daisy',
  'cornflower',
  'lily_of_the_valley',
  'torchflower',
  'sunflower',
  'lilac',
  'rose_bush',
  'peony',
  'pink_petals',
  'wildflowers',
  'leaf_litter',
  'bush',
  'firefly_bush',
  'sweet_berry_bush',
  'dead_bush',
  'azalea',
  'flowering_azalea',
  'wheat',
  'carrots',
  'potatoes',
  'beetroots',
  'sugar_cane',
  'oak_sapling',
  'spruce_sapling',
  'birch_sapling',
  'cherry_sapling',
  'brown_mushroom',
  'red_mushroom',
]);
/** Niedrig, unten voll (oben keine Fläche in der Mitte). */
const LOW: ReadonlySet<string> = new Set([
  'campfire',
  'soul_campfire',
  'stonecutter',
  'enchanting_table',
  'daylight_detector',
  'lectern',
  'chest',
  'trapped_chest',
  'ender_chest',
  'cauldron',
  'water_cauldron',
  'lava_cauldron',
  'powder_snow_cauldron',
  'composter',
  'hopper',
  'grindstone',
]);
/** Kleine Dinge, die auf etwas stehen müssen. */
const STANDING: ReadonlySet<string> = new Set([
  'cake',
  'brewing_stand',
  'sea_pickle',
  'flower_pot',
  'candle',
  'skeleton_skull',
  'wither_skeleton_skull',
  'zombie_head',
  'player_head',
  'creeper_head',
  'piglin_head',
  'dragon_head',
  'rail',
  'powered_rail',
  'detector_rail',
  'activator_rail',
  'redstone_wire',
  'repeater',
  'comparator',
  'heavy_weighted_pressure_plate',
  'light_weighted_pressure_plate',
]);

/** Wo ein Stab (Endstab, Blitzableiter) festsitzt: gegenüber der Richtung, in die er zeigt. */
const ROD_BASE: Readonly<Record<string, Side>> = {
  up: 'down',
  down: 'up',
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

const isLantern = (n: string): boolean => n === 'lantern' || (n.endsWith('_lantern') && !FULL_NAMES.has(n));
const isChain = (n: string): boolean => n === 'chain' || n.endsWith('_chain');
const isRod = (n: string): boolean => n === 'end_rod' || n.endsWith('lightning_rod');
const isPost = (n: string): boolean =>
  n.endsWith('_fence') ||
  n.endsWith('_wall') ||
  n.endsWith('_pane') ||
  n === 'glass_pane' ||
  n === 'iron_bars';
const isCandle = (n: string): boolean => n === 'candle' || (n.endsWith('_candle') && !n.endsWith('cake'));
const isPot = (n: string): boolean => n === 'flower_pot' || n.startsWith('potted_');
const isTorch = (n: string): boolean => n === 'torch' || n.endsWith('_torch');
const isSign = (n: string): boolean => n.endsWith('_sign');
const isBanner = (n: string): boolean => n.endsWith('_banner');
const isCarpet = (n: string): boolean => n.endsWith('_carpet');
const connected = (v: string | undefined): boolean => v === 'true' || v === 'low' || v === 'tall';

function shapeOf(s: State): Form {
  const { name: n, props: p } = s;
  if (AIRISH.has(n)) return AIR;
  if (n === 'water' || n === 'lava' || n === 'bubble_column') return FLUID;
  if (FULL_NAMES.has(n)) return FULL;
  if (isPot(n)) return FLAT;
  if (PLANT_NAMES.has(n) || n.endsWith('_sapling')) return PLANT;
  if (n.endsWith('_slab')) {
    if (p['type'] === 'double') return FULL;
    return p['type'] === 'top' ? form('teil', true, false, ALL) : form('teil', false, true, ALL);
  }
  if (n.endsWith('_stairs'))
    return p['half'] === 'top' ? form('teil', true, false, ALL) : form('teil', false, true, ALL);
  if (isPost(n)) return form('teil', true, true, (d) => connected(p[d]));
  if (isChain(n) || isRod(n)) {
    const axis = p['axis'] ?? axisOf(p['facing']);
    return axis === 'y' ? form('teil', true, true) : form('teil', false, false, (d) => axisOf(d) === axis);
  }
  if (n.endsWith('_fence_gate')) return form('teil', true, false, (d) => axisOf(d) !== axisOf(p['facing']));
  if (n.endsWith('_trapdoor')) {
    if (p['open'] === 'true') return form('teil', false, false, (d) => d === OPPOSITE[p['facing'] as Facing]);
    return p['half'] === 'top' ? form('teil', true, false) : form('teil', false, true);
  }
  if (n.endsWith('_door') || n === 'ladder')
    return form('deko', false, false, (d) => d === OPPOSITE[p['facing'] as Facing]);
  if (n.endsWith('_bed')) return form('teil', false, true, ALL);
  if (LOW.has(n)) return form('teil', false, true, ALL);
  if (n === 'snow') return p['layers'] === '8' ? FULL : FLAT;
  if (isCarpet(n) || n === 'moss_carpet' || n === 'cake' || isCandle(n) || isPot(n)) return FLAT;
  if (isLantern(n)) return form('deko', false, p['hanging'] !== 'true');
  if (n === 'anvil' || n === 'decorated_pot' || n === 'scaffolding')
    return form('teil', true, n !== 'scaffolding', ALL);
  if (isTorch(n) || isSign(n) || isBanner(n) || n === 'bell' || n.endsWith('_button') || n === 'lever')
    return DECO;
  if (STANDING.has(n) || n.endsWith('_pressure_plate') || n.endsWith('_head') || n.endsWith('_skull'))
    return FLAT;
  if (n === 'cobweb' || n === 'vine' || n === 'glow_lichen') return DECO;
  if (n === 'farmland' || n === 'dirt_path' || n === 'soul_sand' || n === 'mud') return FULL;
  return FULL;
}

function axisOf(d: string | undefined): 'x' | 'y' | 'z' {
  if (d === 'east' || d === 'west') return 'x';
  if (d === 'north' || d === 'south') return 'z';
  return 'y';
}

/** Blöcke, an die Zäune und Mauern trotz voller Fläche nicht anschließen (wie in Minecraft). */
const NO_JOIN: ReadonlySet<string> = new Set([
  'barrier',
  'carved_pumpkin',
  'jack_o_lantern',
  'melon',
  'pumpkin',
]);
const isPane = (n: string): boolean => n.endsWith('_pane') || n === 'glass_pane' || n === 'iron_bars';
type Family = 'fence' | 'gate' | 'wall' | 'pane';
const familyOf = (n: string): Family | null => {
  if (n.endsWith('_fence_gate')) return 'gate';
  if (n.endsWith('_fence')) return 'fence';
  if (n.endsWith('_wall')) return 'wall';
  return isPane(n) ? 'pane' : null;
};

/** Ist die Seite `face` des Blocks eine ganze, feste Fläche (zum Anschließen von Zäunen, Mauern, Scheiben)? */
export function sturdyFace(block: string, face: Facing): boolean {
  const { name: n, props: p } = stateOf(block);
  if (NO_JOIN.has(n) || n.endsWith('_leaves') || n.endsWith('shulker_box')) return false;
  if (n.endsWith('_slab')) return p['type'] === 'double';
  if (n.endsWith('_stairs')) return p['facing'] === face;
  return shape(block).kind === 'voll';
}

/** Schließt der Zaun / die Mauer / die Scheibe `me` in Richtung `dir` an den Nachbarn `next` an? */
export function joins(me: string, next: string, dir: Facing): boolean {
  const a = stateOf(me).name;
  const b = stateOf(next).name;
  const fa = familyOf(a);
  const fb = familyOf(b);
  if (fb === 'gate')
    return (fa === 'fence' || fa === 'wall') && axisOf(stateOf(next).props['facing']) !== axisOf(dir);
  if (fa === 'fence' && fb === 'fence') return (a === 'nether_brick_fence') === (b === 'nether_brick_fence');
  if ((fa === 'pane' || fa === 'wall') && (fb === 'pane' || fb === 'wall')) return true;
  return sturdyFace(next, OPPOSITE[dir]);
}

/** Zaun, Mauer, Scheibe oder Gitter (mit Armen zu den Seiten). */
export const isConnecting = (block: string): boolean => {
  const f = familyOf(stateOf(block).name);
  return f === 'fence' || f === 'wall' || f === 'pane';
};

const forms = new Map<string, Form>();
function shape(block: string): Form {
  const known = forms.get(block);
  if (known) return known;
  const f = shapeOf(stateOf(block));
  forms.set(block, f);
  return f;
}

/** Fester Teil eines Baus (kein Luft, Wasser, keine Pflanze oder kleine Deko). */
const isStructure = (b: string): boolean => {
  const k = shape(b).kind;
  return k === 'voll' || k === 'teil';
};
const isAirish = (b: string): boolean => shape(b).kind === 'luft';

// ---------------------------------------------------------------------------------------------------------------
// Halt: wo kleine Dinge anliegen müssen
// ---------------------------------------------------------------------------------------------------------------

interface Ctx {
  readonly w: World;
  readonly c: Canvas;
  readonly out: Fund[];
}

function near(ctx: Ctx, x: number, y: number, z: number, d: Side): string {
  const [dx, dy, dz] = STEP3[d];
  return ctx.w(x + dx, y + dy, z + dz);
}

function report(ctx: Ctx, art: FundArt, x: number, y: number, z: number, was: string, text: string): void {
  ctx.out.push({ art, x, y, z, was, text });
}

/** Hängt (Laterne, Glocke an der Decke …): oben ein Block oder Pfosten. */
const hangs = (ctx: Ctx, x: number, y: number, z: number): boolean => shape(near(ctx, x, y, z, 'up')).bottom;
/** Steht (Laterne, Topf, Kerze …): unten eine Fläche. */
const stands = (ctx: Ctx, x: number, y: number, z: number): boolean => shape(near(ctx, x, y, z, 'down')).top;
/** Liegt an der Wand in Richtung `wall` an (der Block dort zeigt eine Fläche zurück). */
const leans = (ctx: Ctx, x: number, y: number, z: number, wall: Facing): boolean =>
  shape(near(ctx, x, y, z, wall)).side(OPPOSITE[wall]);

/** Erde, auf der Pflanzen wachsen. */
const SOIL: ReadonlySet<string> = new Set([
  'grass_block',
  'dirt',
  'coarse_dirt',
  'podzol',
  'rooted_dirt',
  'mycelium',
  'moss_block',
  'pale_moss_block',
  'mud',
  'farmland',
]);
const CROPS: ReadonlySet<string> = new Set(['wheat', 'carrots', 'potatoes', 'beetroots']);

function checkPlant(ctx: Ctx, x: number, y: number, z: number, b: string, s: State): void {
  const below = ctx.w(x, y - 1, z);
  const under = stateOf(below).name;
  if (s.props['half'] === 'upper') {
    if (stateOf(below).name !== s.name) report(ctx, 'pflanze', x, y, z, b, 'obere Hälfte ohne untere');
    return;
  }
  if (s.props['half'] === 'lower' && stateOf(ctx.w(x, y + 1, z)).name !== s.name)
    report(ctx, 'pflanze', x, y, z, b, 'untere Hälfte ohne obere');
  if (s.name === 'sugar_cane') {
    if (under === 'sugar_cane') return;
    const wet = HORIZONTAL.some((d) => stateOf(near(ctx, x, y - 1, z, d)).name === 'water');
    if (!(SOIL.has(under) || under === 'sand' || under === 'gravel') || !wet)
      report(
        ctx,
        'pflanze',
        x,
        y,
        z,
        b,
        `Zuckerrohr braucht Erde/Sand und Wasser daneben (darunter: ${below})`,
      );
    return;
  }
  const ok = CROPS.has(s.name) ? under === 'farmland' : SOIL.has(under);
  if (!ok) report(ctx, 'pflanze', x, y, z, b, `wächst nicht auf ${below}`);
}

/** Kleine Dinge ohne Halt. */
function checkHold(ctx: Ctx, x: number, y: number, z: number, b: string, s: State): void {
  const { name: n, props: p } = s;
  const facing = p['facing'] as Facing | undefined;
  const fail = (why: string): void => report(ctx, 'ohne-halt', x, y, z, b, why);
  if (isLantern(n)) {
    if (p['hanging'] === 'true') {
      if (!hangs(ctx, x, y, z)) fail(`hängt in der Luft (darüber: ${near(ctx, x, y, z, 'up')})`);
    } else if (!stands(ctx, x, y, z)) fail(`steht in der Luft (darunter: ${near(ctx, x, y, z, 'down')})`);
    return;
  }
  if (n.endsWith('_wall_torch') || n.endsWith('_wall_sign') || n.endsWith('_wall_banner') || n === 'ladder') {
    const wall = OPPOSITE[facing ?? 'north'];
    if (!leans(ctx, x, y, z, wall)) fail(`liegt an keiner Wand an (dahinter: ${near(ctx, x, y, z, wall)})`);
    return;
  }
  if (n.endsWith('_hanging_sign')) {
    if (!n.includes('_wall_') && !hangs(ctx, x, y, z)) fail('Hängeschild ohne Halt oben');
    return;
  }
  if (isTorch(n) || isSign(n) || isBanner(n)) {
    if (!stands(ctx, x, y, z) && !isStructure(near(ctx, x, y, z, 'down')))
      fail(`steht in der Luft (darunter: ${near(ctx, x, y, z, 'down')})`);
    return;
  }
  if (n === 'bell') {
    const attach = p['attachment'] ?? 'floor';
    if (attach === 'floor' && !stands(ctx, x, y, z)) fail('Glocke steht in der Luft');
    if (attach === 'ceiling' && !hangs(ctx, x, y, z))
      fail(`Glocke hängt in der Luft (darüber: ${near(ctx, x, y, z, 'up')})`);
    if (attach.endsWith('wall') && !leans(ctx, x, y, z, facing ?? 'north')) fail('Glocke ohne Wand');
    return;
  }
  if (n.endsWith('_button') || n === 'lever') {
    const face = p['face'] ?? 'wall';
    const held: Readonly<Record<string, () => boolean>> = {
      floor: () => stands(ctx, x, y, z),
      ceiling: () => hangs(ctx, x, y, z),
      wall: () => leans(ctx, x, y, z, OPPOSITE[facing ?? 'north']),
    };
    if (!(held[face] ?? held['wall'])?.()) fail('ohne Halt');
    return;
  }
  if (isRod(n)) {
    const base: Side = ROD_BASE[facing ?? 'up'] ?? 'down';
    if (isAirish(near(ctx, x, y, z, base))) fail('steckt nirgends fest');
    return;
  }
  if (n.endsWith('_trapdoor')) {
    const touches =
      p['open'] === 'true'
        ? leans(ctx, x, y, z, OPPOSITE[facing ?? 'north'])
        : HORIZONTAL.some((d) => leans(ctx, x, y, z, d)) ||
          (p['half'] === 'top' ? hangs(ctx, x, y, z) : stands(ctx, x, y, z));
    if (!touches) fail('Falltür berührt nichts Festes (schwebt vor der Wand)');
    return;
  }
  if (shape(b) === FLAT && !stands(ctx, x, y, z))
    fail(`steht nicht auf einer Fläche (darunter: ${near(ctx, x, y, z, 'down')})`);
}

/** Woran eine Kette festhängen muss: senkrecht oben, waagerecht an beiden Enden. */
const CHAIN_ENDS: Readonly<Record<string, readonly Side[]>> = {
  y: ['up'],
  x: ['east', 'west'],
  z: ['north', 'south'],
};

/** Ketten: beide Enden müssen irgendwo festhängen (senkrecht: oben). */
function checkChain(ctx: Ctx, x: number, y: number, z: number, b: string, s: State): void {
  const axis = s.props['axis'] ?? 'y';
  const ends = CHAIN_ENDS[axis] ?? CHAIN_ENDS['y'] ?? [];
  ends.forEach((end) => {
    const n = near(ctx, x, y, z, end);
    const ns = stateOf(n);
    const sameChain = isChain(ns.name) && (ns.props['axis'] ?? 'y') === axis;
    const held =
      sameChain ||
      (end === 'up' ? shape(n).bottom : end !== 'down' && shape(n).side(OPPOSITE[end as Facing]));
    if (!held)
      report(
        ctx,
        'kette',
        x,
        y,
        z,
        b,
        `Kette endet ${end === 'up' ? 'oben' : `nach ${end}`} im Leeren (${n})`,
      );
  });
}

/** Türen: unten Boden, darüber die obere Hälfte, links und rechts Wand, oben ein Sturz; nicht in eine Wand. */
function checkDoor(ctx: Ctx, x: number, y: number, z: number, b: string, s: State): void {
  if (s.props['half'] !== 'lower') {
    if (stateOf(ctx.w(x, y - 1, z)).name !== s.name)
      report(ctx, 'tuer', x, y, z, b, 'obere Türhälfte ohne untere');
    return;
  }
  const fail = (why: string): void => report(ctx, 'tuer', x, y, z, b, why);
  if (stateOf(ctx.w(x, y + 1, z)).name !== s.name) fail('untere Türhälfte ohne obere');
  if (!stands(ctx, x, y, z)) fail(`Tür steht nicht auf dem Boden (darunter: ${near(ctx, x, y, z, 'down')})`);
  const facing = (s.props['facing'] ?? 'north') as Facing;
  const sides = HORIZONTAL.filter((d) => axisOf(d) !== axisOf(facing));
  const open = sides.filter((d) => [y, y + 1].some((yy) => !isStructure(near(ctx, x, yy, z, d))));
  if (open.length > 0) fail(`Tür ohne Rahmen (daneben nichts: ${open.join(', ')})`);
  if (!isStructure(ctx.w(x, y + 2, z))) fail(`Tür ohne Sturz (darüber: ${ctx.w(x, y + 2, z)})`);
  const blocked = [facing, OPPOSITE[facing]].filter((d) =>
    [y, y + 1].some((yy) => shape(near(ctx, x, yy, z, d)).kind === 'voll'),
  );
  if (blocked.length > 0) fail(`Tür führt in eine Wand (${blocked.join(', ')})`);
}

/** Wasser: daneben oder darunter darf nichts frei sein, sonst läuft es beim nächsten Block-Update aus. */
function checkWater(ctx: Ctx, x: number, y: number, z: number, b: string): void {
  const open = [...HORIZONTAL, 'down' as const].filter((d) => {
    const k = shape(near(ctx, x, y, z, d)).kind;
    return k === 'luft' || k === 'pflanze' || isCarpet(stateOf(near(ctx, x, y, z, d)).name);
  });
  if (open.length > 0) report(ctx, 'wasser', x, y, z, b, `Wasser läuft aus nach ${open.join(', ')}`);
}

/** Zäune, Mauern, Scheiben: jeder Arm braucht etwas, woran er anschließt – und ein Nachbar-Zaun den Arm zurück. */
function checkConnections(ctx: Ctx, x: number, y: number, z: number, b: string, s: State): void {
  const loose = HORIZONTAL.filter((d) => connected(s.props[d]) && !joins(b, near(ctx, x, y, z, d), d));
  if (loose.length > 0) report(ctx, 'verbindung', x, y, z, b, `Arm ins Leere: ${loose.join(', ')}`);
  const oneSided = HORIZONTAL.filter((d) => {
    const n = near(ctx, x, y, z, d);
    return isPost(stateOf(n).name) && connected(stateOf(n).props[OPPOSITE[d]]) && !connected(s.props[d]);
  });
  if (oneSided.length > 0)
    report(ctx, 'verbindung', x, y, z, b, `Arm fehlt zum Nachbarn: ${oneSided.join(', ')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Schwebende Teile: alles, was nicht über feste Blöcke mit dem Boden verbunden ist
// ---------------------------------------------------------------------------------------------------------------

const SPAN = 2048;
const Y_SPAN = 1024;
const Y_OFFSET = 128;
const keyOf = (x: number, y: number, z: number): number =>
  ((x + SPAN / 2) * SPAN + (z + SPAN / 2)) * Y_SPAN + (y + Y_OFFSET);
const pointOf = (k: number): readonly [number, number, number] => {
  const y = (k % Y_SPAN) - Y_OFFSET;
  const rest = Math.floor(k / Y_SPAN);
  return [Math.floor(rest / SPAN) - SPAN / 2, y, (rest % SPAN) - SPAN / 2];
};

/** Arbeitet eine Liste ab, die beim Abarbeiten wächst (Flutfüllung über Hunderttausende Blöcke). */
function drain(list: number[], visit: (k: number) => void): void {
  // eslint-disable-next-line ts-patterns/no-loops -- eine Schleife ist hier das Einfachste (Liste wächst beim Lesen)
  for (let k = list.pop(); k !== undefined; k = list.pop()) visit(k);
}

function floating(ctx: Ctx, allowed: (x: number, y: number, z: number) => boolean): void {
  const solid = new Map<number, string>();
  ctx.c.each((x, y, z, b) => {
    if (!isAirish(b)) solid.set(keyOf(x, y, z), b);
  });
  const grounded = new Set<number>();
  const queue: number[] = [];
  solid.forEach((_, k) => {
    const [x, y, z] = pointOf(k);
    const onGround = y <= GROUND || (y - 1 <= GROUND && ctx.c.get(x, y - 1, z) === undefined);
    if (onGround) {
      grounded.add(k);
      queue.push(k);
    }
  });
  const spread = (
    from: number,
    into: Set<number>,
    list: number[],
    pool: ReadonlyMap<number, string>,
  ): void => {
    const [x, y, z] = pointOf(from);
    SIX.forEach((d) => {
      const [dx, dy, dz] = STEP3[d];
      const k = keyOf(x + dx, y + dy, z + dz);
      if (pool.has(k) && !into.has(k)) {
        into.add(k);
        list.push(k);
      }
    });
  };
  drain(queue, (k) => spread(k, grounded, queue, solid));
  // Was übrig bleibt, in zusammenhängende Teile sortieren: ein Fund je Teil.
  const loose = new Map([...solid].filter(([k]) => !grounded.has(k)));
  const seen = new Set<number>();
  loose.forEach((b, start) => {
    if (seen.has(start)) return;
    const part = new Set([start]);
    const list = [start];
    drain(list, (k) => spread(k, part, list, loose));
    part.forEach((k) => seen.add(k));
    const points = [...part].map(pointOf);
    if (points.every(([x, y, z]) => allowed(x, y, z))) return;
    const [x, y, z] = points.reduce((a, p) => (p[1] < a[1] ? p : a), points[0] ?? [0, 0, 0]);
    const blocks = [...new Set([...part].map((k) => loose.get(k) ?? b))].slice(0, 3).join(', ');
    report(ctx, 'schwebt', x, y, z, blocks, `${part.size} Block/Blöcke ohne Verbindung zum Boden`);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Bäume: wachsen nicht in Häuser, Stände, Dächer und Wege
// ---------------------------------------------------------------------------------------------------------------

const isLog = (b: string): boolean => stateOf(b).name.endsWith('_log') || stateOf(b).name.endsWith('_wood');

/** Gebaut: alles, was weder Gelände noch Baum ist. */
const isBuilt = (origin: string): boolean => origin !== ORIGIN.terrain && origin !== ORIGIN.tree;
/** Pflaster und Wege – darüber braucht man Kopffreiheit. */
const WALKWAY: ReadonlySet<string> = new Set([
  'stone_bricks',
  'mossy_stone_bricks',
  'cracked_stone_bricks',
  'cobblestone',
  'mossy_cobblestone',
  'polished_andesite',
  'andesite',
  'polished_diorite',
  'smooth_quartz',
  'gravel',
  'coarse_dirt',
  'dirt_path',
]);

function trees(ctx: Ctx): void {
  const { c } = ctx;
  // 1. Baum und Bau wollten dieselbe Stelle (wer zuerst kam, ist egal – sichtbar ist es so oder so).
  const clashes = new Map<number, Fund>();
  c.overlaps
    .filter((o) => (o.overOrigin === ORIGIN.tree) !== (o.underOrigin === ORIGIN.tree))
    .filter((o) => o.overOrigin !== ORIGIN.terrain && o.underOrigin !== ORIGIN.terrain)
    .forEach((o) => {
      const treeOver = o.overOrigin === ORIGIN.tree;
      const build = treeOver ? o.under : o.over;
      const tree = treeOver ? o.over : o.under;
      if (isAirish(build) && treeOver) return;
      clashes.set(keyOf(o.x, o.y, o.z), {
        art: 'baum',
        x: o.x,
        y: o.y,
        z: o.z,
        was: tree,
        text: `Baum wächst in ${build}`,
      });
    });
  ctx.out.push(...clashes.values());
  // 2. Stamm auf Weg oder Pflaster, 3. Blätter auf Fuß- oder Kopfhöhe über einem Weg.
  c.each((x, y, z, b) => {
    if (c.originAt(x, y, z) !== ORIGIN.tree) return;
    const below = ctx.w(x, y - 1, z);
    const belowOrigin = c.originAt(x, y - 1, z);
    if (isLog(b) && belowOrigin !== ORIGIN.tree) {
      const soil = SOIL.has(stateOf(below).name) || stateOf(below).name === 'snow_block';
      if (c.get(x, y - 1, z) !== undefined && isBuilt(belowOrigin) && !soil)
        report(ctx, 'baum', x, y, z, b, `Baum steht auf ${below} (Weg/Pflaster)`);
      return;
    }
    if (isLog(b)) return;
    const ground = [1, 2].find((d) => !isAirish(ctx.w(x, y - d, z)));
    if (ground === undefined) return;
    const g = ctx.w(x, y - ground, z);
    const walkway = WALKWAY.has(stateOf(g).name) && isBuilt(c.originAt(x, y - ground, z));
    if (walkway && c.get(x, y - ground, z) !== undefined)
      report(ctx, 'baum', x, y, z, b, `Blätter auf Kopfhöhe über dem Weg (${g})`);
  });
}

/**
 * Zwei Bauten an derselben Stelle über dem Boden (z. B. ein Gartenzaun quer durchs Haus). Erkannt an der Herkunft, die
 * die Bauteile sich geben (`Canvas.tagged`); was keine eigene hat, zählt nicht mit.
 */
function structures(ctx: Ctx): void {
  const named = (o: string): boolean => o !== '' && isBuilt(o);
  const seen = new Map<number, Fund>();
  ctx.c.overlaps
    .filter(
      (o) => !o.skipped && named(o.overOrigin) && named(o.underOrigin) && o.overOrigin !== o.underOrigin,
    )
    .filter((o) => o.y > GROUND && !isAirish(o.under))
    .forEach((o) =>
      seen.set(keyOf(o.x, o.y, o.z), {
        art: 'bau',
        x: o.x,
        y: o.y,
        z: o.z,
        was: o.over,
        text: `${o.overOrigin} überschreibt ${o.under} von ${o.underOrigin}`,
      }),
    );
  ctx.out.push(...seen.values());
}

// ---------------------------------------------------------------------------------------------------------------
// Wesen: Figuren, Schilder, Saison-Deko
// ---------------------------------------------------------------------------------------------------------------

// Ein summon-Befehl: "summon mannequin 20.5 65 -30.5 {Tags:[…],…}" → Art, x, y, z, Rest.
// https://regex101.com/?flavor=javascript&regex=%5Esummon%20(%5Ba-z_%5D%2B)%20(-%3F%5B%5Cd.%5D%2B)%20(-%3F%5B%5Cd.%5D%2B)%20(-%3F%5B%5Cd.%5D%2B)%20(.*)%24&testString=summon%20mannequin%2020.5%2065%20-30.5%20%7BTags%3A%5B'mm_npc'%5D%7D
const SUMMON = /^summon ([a-z_]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (.*)$/;
// Zahlenliste in NBT: "scale:[0.42f,0.42f,0.04f]" → "0.42f,0.42f,0.04f".
// https://regex101.com/?flavor=javascript&regex=scale%3A%5C%5B(%5B%5E%5C%5D%5D%2B)%5C%5D&testString=scale%3A%5B0.42f%2C0.42f%2C0.04f%5D
const SCALE = /scale:\[([^\]]+)\]/;
// Drehung einer Anzeige: "left_rotation:[0f,0.38f,0f,0.92f]" → "0f,0.38f,0f,0.92f"; "right_rotation:[…]" passt nicht.
// https://regex101.com/?flavor=javascript&regex=left_rotation%3A%5C%5B(%5B%5E%5C%5D%5D%2B)%5C%5D&testString=left_rotation%3A%5B0f%2C0.38f%2C0f%2C0.92f%5D
const ROTATION = /left_rotation:\[([^\]]+)\]/;
// Block einer Anzeige: "id:'minecraft:spruce_leaves'" → "spruce_leaves".
// https://regex101.com/?flavor=javascript&regex=id%3A'minecraft%3A(%5Ba-z_%5D%2B)'&testString=block_state%3A%7BName%3A'minecraft%3Aspruce_leaves'%2Cid%3A'minecraft%3Aspruce_leaves'%7D
const DISPLAY_BLOCK = /id:'minecraft:([a-z_]+)'/;

interface Summon {
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly nbt: string;
}

export function parseSummon(cmd: string): Summon | null {
  const m = SUMMON.exec(cmd);
  if (!m) return null;
  return { type: m[1] ?? '', x: Number(m[2]), y: Number(m[3]), z: Number(m[4]), nbt: m[5] ?? '' };
}

const numbers = (s: string | undefined): number[] => (s ?? '').split(',').map((v) => Number.parseFloat(v));

/** Mitte und halbe Ausdehnung einer Block-Anzeige (die Lobby setzt Anzeigen immer um ihre Mitte). */
interface Box3 {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** Drehmatrix aus dem Quaternion einer Anzeige (Zeilen = Weltachsen). */
function rotationOf(s: Summon): number[][] {
  const [qx = 0, qy = 0, qz = 0, qw = 1] = numbers(ROTATION.exec(s.nbt)?.[1]);
  return [
    [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
    [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
    [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)],
  ];
}

type Vec3 = readonly [number, number, number];

/** Gedrehter Quader einer Anzeige: Mitte, ihre drei Achsen in der Welt und die halbe Ausdehnung je Achse. */
interface Obb {
  readonly c: Vec3;
  readonly axes: readonly Vec3[];
  readonly half: Vec3;
}

function displayObb(s: Summon): Obb {
  const [sx = 1, sy = 1, sz = 1] = numbers(SCALE.exec(s.nbt)?.[1]);
  const r = rotationOf(s);
  const column = (j: number): Vec3 => [r[0]?.[j] ?? 0, r[1]?.[j] ?? 0, r[2]?.[j] ?? 0];
  return { c: [s.x, s.y, s.z], axes: [column(0), column(1), column(2)], half: [sx / 2, sy / 2, sz / 2] };
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const WORLD_AXES: readonly Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
/** Kürzere Achsen (Kreuzprodukt fast paralleler Achsen) trennen nichts. */
const TINY = 1e-9;

/**
 * Schneidet der gedrehte Quader den achsparallelen Quader min…max? Trennachsen-Test: getrennt sind sie genau dann,
 * wenn es unter den 3 + 3 Flächenachsen und ihren 9 Kreuzprodukten eine Achse gibt, auf der sich ihre Schatten nicht
 * überlappen.
 */
function obbHitsBox(o: Obb, min: Vec3, max: Vec3): boolean {
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const half: Vec3 = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
  const t: Vec3 = [o.c[0] - center[0], o.c[1] - center[1], o.c[2] - center[2]];
  const axes = [
    ...WORLD_AXES,
    ...o.axes,
    ...WORLD_AXES.flatMap((a) => o.axes.map((b) => cross(a, b))),
  ].filter((a) => dot(a, a) > TINY);
  return axes.every((a) => {
    const box = half[0] * Math.abs(a[0]) + half[1] * Math.abs(a[1]) + half[2] * Math.abs(a[2]);
    const own = o.axes.reduce((sum, axis, j) => sum + (o.half[j] ?? 0) * Math.abs(dot(axis, a)), 0);
    return Math.abs(dot(t, a)) < box + own;
  });
}

/** Halbe Zelle: Höhe einer Stufe, Tiefe der Rückwand einer Treppe. */
const HALF_CELL = 0.5;
/** Rückwand einer Treppe (in Richtung `facing`) in der Zelle: x/z von … bis. */
const STAIR_BACK: Readonly<Record<string, readonly [number, number, number, number]>> = {
  north: [0, 1, 0, HALF_CELL],
  south: [0, 1, HALF_CELL, 1],
  west: [0, HALF_CELL, 0, 1],
  east: [HALF_CELL, 1, 0, 1],
};

/** Feste Quader eines Blocks in seiner Zelle (0 … 1): Stufen und Treppen genau, alles andere die ganze Zelle. */
function blockBoxes(block: string): Array<readonly [Vec3, Vec3]> {
  const { name: n, props: p } = stateOf(block);
  const lower: readonly [Vec3, Vec3] = [
    [0, 0, 0],
    [1, HALF_CELL, 1],
  ];
  const upper: readonly [Vec3, Vec3] = [
    [0, HALF_CELL, 0],
    [1, 1, 1],
  ];
  if (n.endsWith('_slab') && p['type'] !== 'double') return [p['type'] === 'top' ? upper : lower];
  if (n.endsWith('_stairs')) {
    const top = p['half'] === 'top';
    const [x1, x2, z1, z2] = STAIR_BACK[p['facing'] ?? ''] ?? [0, 1, 0, 1];
    const [y1, y2] = top ? [0, HALF_CELL] : [HALF_CELL, 1];
    return [
      top ? upper : lower,
      [
        [x1, y1, z1],
        [x2, y2, z2],
      ],
    ];
  }
  return [
    [
      [0, 0, 0],
      [1, 1, 1],
    ],
  ];
}

function displayBox(s: Summon): Box3 {
  const [sx = 1, sy = 1, sz = 1] = numbers(SCALE.exec(s.nbt)?.[1]);
  // Halbe Ausdehnung je Weltachse = Summe der gedrehten Achsen.
  const r = rotationOf(s);
  const half = r.map(
    (row) =>
      (Math.abs(row[0] ?? 0) * sx) / 2 + (Math.abs(row[1] ?? 0) * sy) / 2 + (Math.abs(row[2] ?? 0) * sz) / 2,
  );
  const [hx = 0, hy = 0, hz = 0] = half;
  return { min: [s.x - hx, s.y - hy, s.z - hz], max: [s.x + hx, s.y + hy, s.z + hz] };
}

/** Wie weit ein Punkt von einem Block entfernt ist (0 = innen). */
function distanceToCell(px: number, py: number, pz: number, x: number, y: number, z: number): number {
  const d = (p: number, a: number): number => Math.max(a - p, 0, p - (a + 1));
  return Math.hypot(d(px, x), d(py, y), d(pz, z));
}

/** Gibt es in `reach` um den Punkt einen festen Block? */
function blockNear(ctx: Ctx, px: number, py: number, pz: number, reach: number): boolean {
  return nearStructure(ctx.w, px, py, pz, reach);
}

/** Gibt es in `reach` um den Punkt einen festen Bau-Block? (Zum Aufhängen von Ketten und Schildern.) */
export function nearStructure(w: World, px: number, py: number, pz: number, reach: number): boolean {
  const r = Math.ceil(reach) + 1;
  const span = Array.from({ length: 2 * r + 1 }, (_, i) => i - r);
  return span.some((dx) =>
    span.some((dy) =>
      span.some((dz) => {
        const [x, y, z] = [Math.floor(px) + dx, Math.floor(py) + dy, Math.floor(pz) + dz];
        return isStructure(w(x, y, z)) && distanceToCell(px, py, pz, x, y, z) <= reach;
      }),
    ),
  );
}

const cellOf = (v: number): number => Math.floor(v + 1e-6);
const SEAT_LIFT = 0.55;
const isSeat = (b: string): boolean => {
  const n = stateOf(b).name;
  return n.endsWith('_stairs') || (n.endsWith('_slab') && stateOf(b).props['type'] !== 'top');
};

/** Figuren (Mannequins, Rüstungsständer): stehen auf festem Boden, nicht in einer Wand; Sitzende auf einem Sitz. */
function figures(ctx: Ctx): void {
  ctx.c.extra.forEach((cmd) => {
    const s = parseSummon(cmd);
    if (!s) return;
    const [x, y, z] = [cellOf(s.x), cellOf(s.y), cellOf(s.z)];
    const who = `${s.type} ${s.x} ${s.y} ${s.z}`;
    if (s.type === 'block_display' && s.nbt.includes("'mm_seat'")) {
      const seatY = cellOf(s.y - SEAT_LIFT);
      const seat = ctx.w(x, seatY, z);
      if (!isSeat(seat)) report(ctx, 'figur', x, seatY, z, who, `sitzt auf ${seat} statt auf einer Bank`);
      return;
    }
    if (s.type !== 'mannequin' && s.type !== 'armor_stand') {
      if (s.type === 'text_display' && shape(ctx.w(x, y, z)).kind === 'voll')
        report(ctx, 'figur', x, y, z, who, `Schrift steckt in ${ctx.w(x, y, z)}`);
      return;
    }
    const body = [y, y + 1].map((yy) => ctx.w(x, yy, z)).filter((b) => isStructure(b) && !isSeat(b));
    if (body.length > 0) report(ctx, 'figur', x, y, z, who, `steckt in ${body.join(', ')}`);
    if (!stands(ctx, x, y, z) && !isStructure(ctx.w(x, y - 1, z)))
      report(ctx, 'figur', x, y, z, who, `schwebt (darunter: ${ctx.w(x, y - 1, z)})`);
  });
}

/** Kleine Teile einer Wimpel- bzw. Lichterkette (dünne Rauten bzw. leuchtende Würfelchen). */
const isChainPiece = (s: Summon): boolean => {
  const [sx = 1, sy = 1, sz = 1] = numbers(SCALE.exec(s.nbt)?.[1]);
  return Math.max(sx, sy, sz) <= 0.45 && Math.min(sx, sy, sz) <= 0.25 && !s.nbt.includes('rabbit');
};
/** Wimpel hängen mit ihrer oberen Spitze an der Kette (Raute: halbe Diagonale über der Mitte). */
const hookOf = (s: Summon): number => {
  const [sx = 0] = numbers(SCALE.exec(s.nbt)?.[1]);
  return s.nbt.includes('brightness') ? 0 : sx / 2;
};
/** So weit darf das Ende einer Kette von einem Block entfernt sein. */
const CHAIN_REACH = 0.6;
/** Neue Kette, wenn zwei Teile weiter auseinander liegen. */
const CHAIN_GAP = 1.5;
/** So weit darf eine Anzeige in einen Block hineinragen, ohne dass es auffällt. */
const INSIDE = 0.1;
/**
 * Eine Kette ist lang (mindestens 2 Blöcke) und ihre Teile hängen in Abständen (Wimpel, Lichter: etwa ein Block) –
 * kleine Teile dicht an dicht oder auf engem Raum sind ein Modell (Figur, Schlitten, Stern) und halten wie die übrigen
 * Anzeigen.
 */
const CHAIN_SPAN = 2;
const CHAIN_STEP = 0.6;
/** Abstand, ab dem Anzeigen sich nicht mehr berühren. */
const TOUCH = 0.08;

/**
 * Erster Bau-Block, in den eine Anzeige deutlich hineinragt (mehr als ein Hauch in jeder Richtung) – gedreht genau
 * gerechnet, Stufen und Treppen mit ihrer echten Form (eine Schneeplatte auf den Kanten eines Treppendachs steckt nicht
 * darin).
 */
function stuckIn(w: World, s: Summon, b: Box3): string | null {
  const cells = (i: 0 | 1 | 2): number[] => {
    const lo = Math.floor((b.min[i] ?? 0) + INSIDE);
    const hi = Math.floor((b.max[i] ?? 0) - INSIDE);
    return lo > hi ? [] : Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
  };
  const obb = displayObb(s);
  const hits = ([x, y, z]: readonly [number, number, number]): boolean =>
    isStructure(w(x, y, z)) &&
    blockBoxes(w(x, y, z)).some(([lo, hi]) =>
      obbHitsBox(
        obb,
        [x + lo[0] + INSIDE, y + lo[1] + INSIDE, z + lo[2] + INSIDE],
        [x + hi[0] - INSIDE, y + hi[1] - INSIDE, z + hi[2] - INSIDE],
      ),
    );
  const hit = cells(0)
    .flatMap((x) => cells(1).flatMap((y) => cells(2).map((z) => [x, y, z] as const)))
    .find(hits);
  return hit ? `${w(...hit)} bei ${hit.join(' ')}` : null;
}

/** Berührt der Umriss einer Anzeige einen Bau-Block (Boden, Wand, Dach)? */
function touchesBlock(w: World, b: Box3): boolean {
  const xs = [Math.floor(b.min[0] - TOUCH), Math.floor(b.max[0] + TOUCH)];
  const ys = [Math.floor(b.min[1] - TOUCH), Math.floor(b.max[1] + TOUCH)];
  const zs = [Math.floor(b.min[2] - TOUCH), Math.floor(b.max[2] + TOUCH)];
  const span = (a: number[]): number[] =>
    Array.from({ length: (a[1] ?? 0) - (a[0] ?? 0) + 1 }, (_, i) => (a[0] ?? 0) + i);
  return span(xs).some((x) => span(ys).some((y) => span(zs).some((z) => isStructure(w(x, y, z)))));
}

/** Zum Aufstellen von Deko: steckt die Anzeige (summon-Befehl) in einem Bau-Block? Dann welcher, sonst null. */
export function displayStuck(w: World, cmd: string): string | null {
  const s = parseSummon(cmd);
  return s ? stuckIn(w, s, displayBox(s)) : null;
}

/** Zum Aufstellen von Deko: berührt die Anzeige (summon-Befehl) einen Bau-Block? */
export function displayTouches(w: World, cmd: string): boolean {
  const s = parseSummon(cmd);
  return s ? touchesBlock(w, displayBox(s)) : false;
}

/** Saison-Deko (Block-Anzeigen, Schriften, Tiere): nicht in Blöcken, nichts in der Luft, Ketten mit Halt. */
export function checkDecorations(c: Canvas, commands: readonly string[], world?: World): Fund[] {
  const w = world ?? worldOf(c);
  const ctx: Ctx = { w, c, out: [] };
  const all = commands.map(parseSummon).filter((s): s is Summon => s !== null);
  const displays = all.filter((s) => s.type === 'block_display');
  const where = (s: Summon): string => `${DISPLAY_BLOCK.exec(s.nbt)?.[1] ?? s.type} @ ${s.x} ${s.y} ${s.z}`;
  // Ketten: aufeinanderfolgende kleine Teile, Enden brauchen einen Block in der Nähe.
  const runs = displays.filter(isChainPiece).reduce<Summon[][]>((list, s) => {
    const run = list[list.length - 1];
    const last = run?.[run.length - 1];
    if (run && last && Math.hypot(s.x - last.x, s.y - last.y, s.z - last.z) < CHAIN_GAP) run.push(s);
    else list.push([s]);
    return list;
  }, []);
  /** Wie weit die Teile einer Folge auseinander reichen (Diagonale ihres Umrisses). */
  const span = (run: readonly Summon[]): number => {
    const extent = (get: (s: Summon) => number): number =>
      Math.max(...run.map(get)) - Math.min(...run.map(get));
    return Math.hypot(
      extent((s) => s.x),
      extent((s) => s.y),
      extent((s) => s.z),
    );
  };
  /** Mittlerer Abstand zweier aufeinanderfolgender Teile. */
  const step = (run: readonly Summon[]): number =>
    run
      .slice(1)
      .reduce(
        (sum, s, i) =>
          sum + Math.hypot(s.x - (run[i]?.x ?? 0), s.y - (run[i]?.y ?? 0), s.z - (run[i]?.z ?? 0)),
        0,
      ) / Math.max(1, run.length - 1);
  const isChain = (run: readonly Summon[]): boolean => span(run) >= CHAIN_SPAN && step(run) >= CHAIN_STEP;
  const chains = runs.filter(isChain);
  const models = new Set(runs.filter((run) => !isChain(run)).flat());
  chains.forEach((run) => {
    const ends = [run[0], run[run.length - 1]].filter((s): s is Summon => s !== undefined);
    ends.forEach((s) => {
      const hy = s.y + hookOf(s);
      if (!blockNear(ctx, s.x, hy, s.z, CHAIN_REACH))
        report(
          ctx,
          'deko',
          cellOf(s.x),
          cellOf(hy),
          cellOf(s.z),
          where(s),
          'Ende einer Kette hängt in der Luft',
        );
    });
  });
  // Übrige Anzeigen (auch kleine Teile eines Modells): berühren den Boden, eine Wand oder eine andere Anzeige, die
  // schon hält.
  const solids = displays.filter((s) => !isChainPiece(s) || models.has(s));
  const boxes = solids.map(displayBox);
  const touch = (a: Box3, b: Box3): boolean =>
    [0, 1, 2].every(
      (i) => (a.min[i] ?? 0) <= (b.max[i] ?? 0) + TOUCH && (b.min[i] ?? 0) <= (a.max[i] ?? 0) + TOUCH,
    );
  const held = new Set(boxes.map((b, i) => (touchesBlock(w, b) ? i : -1)).filter((i) => i >= 0));
  const grow = (): boolean => {
    const before = held.size;
    boxes.forEach((b, i) => {
      if (!held.has(i) && [...held].some((j) => touch(b, boxes[j] ?? b))) held.add(i);
    });
    return held.size > before;
  };
  Array.from({ length: boxes.length }).some(() => !grow());
  solids.forEach((s, i) => {
    const b = boxes[i];
    if (!b) return;
    const inside = stuckIn(w, s, b);
    if (inside) report(ctx, 'deko', cellOf(s.x), cellOf(s.y), cellOf(s.z), where(s), `steckt in ${inside}`);
    else if (!held.has(i))
      report(ctx, 'deko', cellOf(s.x), cellOf(s.y), cellOf(s.z), where(s), 'schwebt in der Luft');
  });
  // Schriften (z. B. Herzen an Ständen): nicht in einem Block, und etwas in der Nähe, woran sie hängen.
  all
    .filter((s) => s.type === 'text_display')
    .forEach((s) => {
      const inside = shape(w(cellOf(s.x), cellOf(s.y), cellOf(s.z))).kind === 'voll';
      if (inside)
        report(
          ctx,
          'deko',
          cellOf(s.x),
          cellOf(s.y),
          cellOf(s.z),
          `text_display @ ${s.x} ${s.y} ${s.z}`,
          'Schrift steckt in einem Block',
        );
      else if (!blockNear(ctx, s.x, s.y, s.z, 1.2))
        report(
          ctx,
          'deko',
          cellOf(s.x),
          cellOf(s.y),
          cellOf(s.z),
          `text_display @ ${s.x} ${s.y} ${s.z}`,
          'Schrift schwebt frei (nichts in der Nähe)',
        );
    });
  // Tiere: auf festem Boden, nicht in Blöcken.
  all
    .filter((s) => s.type !== 'block_display' && s.type !== 'text_display')
    .forEach((s) => {
      const [x, y, z] = [cellOf(s.x), cellOf(s.y), cellOf(s.z)];
      if (isStructure(w(x, y, z)))
        report(ctx, 'deko', x, y, z, `${s.type} @ ${s.x} ${s.y} ${s.z}`, `steckt in ${w(x, y, z)}`);
      else if (!isStructure(w(x, y - 1, z)))
        report(ctx, 'deko', x, y, z, `${s.type} @ ${s.x} ${s.y} ${s.z}`, 'steht in der Luft');
    });
  return ctx.out;
}

// ---------------------------------------------------------------------------------------------------------------
// Gesamtprüfung
// ---------------------------------------------------------------------------------------------------------------

/** Die Welt so, wie sie nach dem Bau aussieht: der Plan, darunter die flache Grundwelt (Gras auf 64). */
export function worldOf(c: Canvas): World {
  return (x, y, z) => c.get(x, y, z) ?? (y <= GROUND ? 'grass_block' : 'air');
}

export interface CheckOptions {
  /** Stellen, die mit Absicht frei in der Luft stehen (z. B. Parkour-Sprünge). */
  readonly floatingAllowed?: (x: number, y: number, z: number) => boolean;
  /** Wo Spieler herumlaufen: dort fällt nackte Erde auf (draußen im Gelände ist sie egal). Ohne: keine Erd-Prüfung. */
  readonly walkArea?: (x: number, y: number, z: number) => boolean;
}

/** Erde, die man nicht offen sehen soll; grobe Erde liegt als Weg absichtlich oben, nur ihre Seiten dürfen nicht frei sein. */
const BARE: ReadonlySet<string> = new Set(['dirt', 'rooted_dirt']);
const BARE_SIDES: ReadonlySet<string> = new Set(['coarse_dirt']);
/** Schritte zu den vier Nachbarn (x, z). */
const HORIZONTAL_STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Rand um die geprüfte Erde, in dem nach Himmel gesucht wird. */
const AIR_MARGIN = 6;
/** So viele Schritte von einer Stelle unter freiem Himmel sieht man noch hinein (Überhang, Nische, Laubdach). */
const SEEN_STEPS = 4;

/**
 * Luft, die man sieht: unter freiem Himmel oder höchstens `SEEN_STEPS` Schritte (durch Nicht-Vollblöcke) davon entfernt.
 * Das Gelände füllt jede Säule nur bis knapp unter die Nachbarn – im Berg bleiben so lange Hohlräume, die niemand
 * sieht; Erde daneben ist kein Fehler.
 */
function visibleAir(
  ctx: Ctx,
  cells: ReadonlyArray<readonly [number, number, number, ...unknown[]]>,
): (x: number, y: number, z: number) => boolean {
  if (cells.length === 0) return () => true;
  const lo = (i: 0 | 1 | 2): number => cells.reduce((m, p) => Math.min(m, p[i]), Infinity) - AIR_MARGIN;
  const hi = (i: 0 | 1 | 2): number => cells.reduce((m, p) => Math.max(m, p[i]), -Infinity) + AIR_MARGIN;
  const [x1, z1, x2, z2] = [lo(0), lo(2), hi(0), hi(2)];
  const nz = z2 - z1 + 1;
  const inBox = (x: number, z: number): boolean => x >= x1 && x <= x2 && z >= z1 && z <= z2;
  const col = (x: number, z: number): number => (x - x1) * nz + (z - z1);
  // Höchster Vollblock je Säule (darunter liegt die Grundwelt bis 64)
  const roofOf = new Int32Array((x2 - x1 + 1) * nz).fill(GROUND);
  ctx.c.each((x, y, z, b) => {
    if (inBox(x, z) && y > (roofOf[col(x, z)] ?? GROUND) && shape(b).kind === 'voll') roofOf[col(x, z)] = y;
  });
  const sky = (x: number, y: number, z: number): boolean => !inBox(x, z) || y > (roofOf[col(x, z)] ?? GROUND);
  const passable = (x: number, y: number, z: number): boolean => shape(ctx.w(x, y, z)).kind !== 'voll';
  // Von jeder Stelle unter freiem Himmel, die an eine überdachte grenzt, ein paar Schritte hinein
  const steps = new Map<number, number>();
  const queue: number[] = [];
  const enter = (x: number, y: number, z: number, d: number): void => {
    const k = keyOf(x, y, z);
    if (d > SEEN_STEPS || sky(x, y, z) || !passable(x, y, z) || (steps.get(k) ?? Infinity) <= d) return;
    steps.set(k, d);
    queue.push(x, y, z, d);
  };
  range(x1, x2).forEach((x) =>
    range(z1, z2).forEach((z) => {
      const from = (roofOf[col(x, z)] ?? GROUND) + 1;
      const to = Math.max(
        from,
        ...HORIZONTAL_STEPS.map(([dx, dz]) =>
          inBox(x + dx, z + dz) ? (roofOf[col(x + dx, z + dz)] ?? GROUND) : from,
        ),
      );
      range(from, to).forEach((y) => HORIZONTAL_STEPS.forEach(([dx, dz]) => enter(x + dx, y, z + dz, 1)));
    }),
  );
  // eslint-disable-next-line ts-patterns/no-loops -- Breitensuche: die Liste wächst beim Lesen
  for (let d = queue.pop(); d !== undefined; d = queue.pop()) {
    const [z, y, x] = [queue.pop() ?? 0, queue.pop() ?? 0, queue.pop() ?? 0];
    SIX.forEach((side) => {
      const [dx, dy, dz] = STEP3[side];
      enter(x + dx, y + dy, z + dz, d + 1);
    });
  }
  return (x, y, z) => sky(x, y, z) || steps.has(keyOf(x, y, z));
}

/** Nackte Erde: Seite (oder bei Erde auch Oberseite) liegt frei zu Luft, die man sieht – sieht aus wie abgeschnitten. */
function checkBareDirt(ctx: Ctx, cells: ReadonlyArray<readonly [number, number, number, string]>): void {
  const seen = visibleAir(ctx, cells);
  cells.forEach(([x, y, z, b]) => {
    const name = stateOf(b).name;
    const open = (d: Side): boolean => {
      const k = shape(near(ctx, x, y, z, d)).kind;
      const [dx, dy, dz] = STEP3[d];
      return (k === 'luft' || k === 'pflanze') && seen(x + dx, y + dy, z + dz);
    };
    const sides = [...HORIZONTAL, ...(BARE.has(name) ? (['up'] as const) : [])].filter(open);
    if (sides.length > 0) report(ctx, 'erde', x, y, z, b, `nackte Erde, frei nach ${sides.join(', ')}`);
  });
}

/** Den ganzen Plan prüfen. */
export function checkPlan(c: Canvas, opts: CheckOptions = {}): Fund[] {
  const ctx: Ctx = { w: worldOf(c), c, out: [] };
  const dirt: Array<readonly [number, number, number, string]> = [];
  c.each((x, y, z, b) => {
    const s = stateOf(b);
    const f = shape(b);
    if (f.kind === 'luft') return;
    if (s.name === 'water' || s.props['waterlogged'] === 'true') checkWater(ctx, x, y, z, b);
    if (f.kind === 'pflanze') return checkPlant(ctx, x, y, z, b, s);
    if (isChain(s.name)) return checkChain(ctx, x, y, z, b, s);
    if (s.name.endsWith('_door')) return checkDoor(ctx, x, y, z, b, s);
    if (isPost(s.name)) return checkConnections(ctx, x, y, z, b, s);
    if (f.kind === 'deko' || s.name.endsWith('_trapdoor') || isRod(s.name)) checkHold(ctx, x, y, z, b, s);
    if ((BARE.has(s.name) || BARE_SIDES.has(s.name)) && opts.walkArea?.(x, y, z)) dirt.push([x, y, z, b]);
  });
  checkBareDirt(ctx, dirt);
  floating(ctx, opts.floatingAllowed ?? (() => false));
  trees(ctx);
  structures(ctx);
  figures(ctx);
  return ctx.out;
}

/** Funde lesbar: „ohne-halt  12 70 -3  lantern[hanging=true]: hängt in der Luft …“. */
export function describe(funde: readonly Fund[]): string[] {
  return funde.map((f) => `${f.art.padEnd(10)} ${f.x} ${f.y} ${f.z}  ${f.was}: ${f.text}`);
}

/** Zählt Funde je Art. */
export function countByKind(funde: readonly Fund[]): Readonly<Record<string, number>> {
  return funde.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.art]: (acc[f.art] ?? 0) + 1 }), {});
}

export { STEP };
