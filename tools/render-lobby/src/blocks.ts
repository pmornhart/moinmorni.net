/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/no-loop-statements, ts-patterns/no-nested-ternary -- render tool: Pixel- und Voxel-Schleifen */
/**
 * Block-Namen → Form und Textur-Schlüssel. Nur grobe Formen (Treppe = untere Hälfte + obere Stufe, Zaun = Pfosten +
 * Latten, Blume = zwei gekreuzte Flächen); die Texturen malt `textures.ts` selbst (keine Minecraft-Dateien).
 */

export type Face = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';
export const FACES: readonly Face[] = ['top', 'bottom', 'north', 'south', 'east', 'west'];
export const FACE_DIR: Record<Face, readonly [number, number, number]> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
};

/** Quader in 1/16-Block-Einheiten (darf über den Block hinausragen, z. B. Banner). */
export interface Part {
  readonly x1: number;
  readonly y1: number;
  readonly z1: number;
  readonly x2: number;
  readonly y2: number;
  readonly z2: number;
  /** Textur je Seite (fehlt eine, gilt `side`). */
  readonly tex: Partial<Record<Face | 'side', string>>;
}

export type Kind = 'air' | 'cube' | 'glass' | 'water' | 'cross' | 'parts' | 'fence' | 'pane' | 'wall';
export type Group = 'opaque' | 'cutout' | 'glass' | 'water';

export interface BlockInfo {
  readonly name: string;
  readonly kind: Kind;
  /** Verdeckt Nachbarflächen und zählt für die Umgebungsverdeckung (AO). */
  readonly opaque: boolean;
  readonly group: Group;
  /** Würfel/Glas: Textur je Seite. */
  readonly tex: Record<Face, string>;
  /** Teile (für parts) bzw. Kreuz-Textur (cross: tex.top). */
  readonly parts: readonly Part[];
  /** Kreuz: Höhe in 1/16 und Versatz nach oben (Blumentopf). */
  readonly cross?: { readonly tex: string; readonly y1: number; readonly y2: number; readonly scale: number };
  /** Lichtquelle 0 … 15 (Minecraft-Blocklicht). */
  readonly light: number;
  /** Selbstleuchten der Textur (Laternen-Glas, Glut). */
  readonly emit: number;
  /** Fensterscheibe (leuchtet nachts warm). */
  readonly window: boolean;
  /** Färbung nach Gegend (Gras, Laub). */
  readonly tint: 'grass' | 'leaves' | 'rock' | 'none';
  readonly props: Readonly<Record<string, string>>;
}

function stripPrefix(s: string, prefix: string): string {
  return s.startsWith(prefix) ? s.slice(prefix.length) : s;
}

const SHAPE_SUFFIXES = ['_stairs', '_slab', '_wall', '_fence_gate', '_fence', '_pressure_plate', '_button'];

function stripShape(n: string): string {
  const suffix = SHAPE_SUFFIXES.find((x) => n.endsWith(x));
  return suffix ? n.slice(0, -suffix.length) : n;
}

const WOODS = [
  'oak',
  'spruce',
  'birch',
  'jungle',
  'acacia',
  'dark_oak',
  'mangrove',
  'cherry',
  'pale_oak',
  'bamboo',
];

export function parse(block: string): { name: string; props: Record<string, string> } {
  const plain = stripPrefix(block, 'minecraft:');
  const i = plain.indexOf('[');
  if (i < 0) return { name: plain, props: {} };
  const props: Record<string, string> = {};
  plain
    .slice(i + 1, -1)
    .split(',')
    .filter(Boolean)
    .forEach((kv) => {
      const [k, v] = kv.split('=');
      if (k) props[k] = v ?? '';
    });
  return { name: plain.slice(0, i), props };
}

const CROSS_PARTS = [
  'poppy',
  'dandelion',
  'tulip',
  'orchid',
  'allium',
  'bluet',
  'daisy',
  'cornflower',
  'lily_of_the_valley',
  'short_grass',
  'tall_grass',
  'fern',
  'sapling',
  'sugar_cane',
  'wheat',
  'carrots',
  'beetroots',
  'potatoes',
  'rose_bush',
  'peony',
  'lilac',
  'sunflower',
  'dead_bush',
  'sweet_berry_bush',
];

/** Material, aus dem Treppe/Stufe/Mauer/Zaun gemacht ist (für die Textur). */
export function material(name: string): string {
  const n = stripPrefix(name, 'waxed_');
  const base = stripShape(n);
  if (base === n) return n;
  if (WOODS.includes(base)) return `${base}_planks`;
  if (base === 'stone_brick' || base === 'mossy_stone_brick') return `${base}s`;
  if (base === 'brick') return 'bricks';
  if (base === 'quartz') return 'quartz_block';
  if (base === 'nether_brick') return 'nether_bricks';
  if (base === 'light_weighted' || base === 'heavy_weighted')
    return base === 'light_weighted' ? 'gold_block' : 'iron_block';
  if (base.endsWith('_brick')) return `${base}s`;
  if (base.endsWith('_tile')) return `${base}s`;
  return base;
}

function woodOf(name: string): string | undefined {
  return [...WOODS].sort((a, b) => b.length - a.length).find((w) => name.includes(w));
}

const GRASS: Partial<Record<Face, string>> = { top: 'grass_top', bottom: 'dirt' };

/** Textur-Schlüssel für einen ganzen Block und eine Seite. */
export function cubeTex(name: string, props: Record<string, string>, face: Face): string {
  const n = stripPrefix(name, 'waxed_');
  const vertical = face === 'top' || face === 'bottom';
  if (n === 'grass_block') return GRASS[face] ?? 'grass_side';
  if (n.endsWith('_log') || n.endsWith('_wood') || n.endsWith('_stem')) {
    const axis = props.axis ?? 'y';
    const along =
      (axis === 'y' && vertical) ||
      (axis === 'x' && (face === 'east' || face === 'west')) ||
      (axis === 'z' && (face === 'north' || face === 'south'));
    if (n.endsWith('_wood')) return `${n.slice(0, -'_wood'.length)}_log`;
    if (along) return `${n}_top`;
    return axis !== 'y' ? `${n}#h` : n;
  }
  if (n === 'quartz_pillar') return vertical ? 'quartz_pillar_top' : 'quartz_pillar';
  if (n === 'barrel') return vertical ? 'barrel_top' : 'barrel';
  if (n === 'bookshelf') return vertical ? 'oak_planks' : 'bookshelf';
  if (n === 'hay_block') return vertical ? 'hay_top' : 'hay';
  if (n === 'farmland') return face === 'top' ? 'farmland' : 'dirt';
  if (n === 'snow_block' || n === 'snow') return 'snow';
  if (
    n === 'crafting_table' ||
    n === 'cartography_table' ||
    n === 'smithing_table' ||
    n === 'loom' ||
    n === 'note_block' ||
    n === 'jukebox'
  ) {
    if (face === 'top') return `${n}_top`;
    return vertical ? 'oak_planks' : n;
  }
  if (['furnace', 'smoker', 'blast_furnace', 'dispenser'].includes(n)) {
    const front = (props.facing ?? 'south') === face;
    if (front) return props.lit === 'true' ? `${n}_front_lit` : `${n}_front`;
    return vertical ? 'furnace_top' : 'furnace_side';
  }
  if (n === 'pumpkin' || n === 'melon') return vertical ? `${n}_top` : n;
  if (n.endsWith('cauldron')) {
    if (face !== 'top' || n === 'cauldron') return 'cauldron';
    return n.startsWith('lava') ? 'lava' : 'water_still';
  }
  if (n === 'scaffolding') return 'scaffolding';
  if (n === 'composter') return 'composter';
  if (n === 'target') return vertical ? 'hay_top' : 'target';
  if (n === 'ochre_froglight') return 'ochre_froglight';
  return material(n);
}

function cubeTexAll(name: string, props: Record<string, string>): Record<Face, string> {
  return Object.fromEntries(FACES.map((f) => [f, cubeTex(name, props, f)])) as Record<Face, string>;
}

function box(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, tex: Part['tex']): Part {
  return { x1, y1, z1, x2, y2, z2, tex };
}

/** Dreht einen Teil (angelegt für Blick nach Norden) in die gegebene Richtung. */
function turn(p: Part, facing: string): Part {
  const rot = (x: number, z: number): [number, number] => {
    if (facing === 'south') return [16 - x, 16 - z];
    if (facing === 'east') return [16 - z, x];
    if (facing === 'west') return [z, 16 - x];
    return [x, z];
  };
  const [ax, az] = rot(p.x1, p.z1);
  const [bx, bz] = rot(p.x2, p.z2);
  return { ...p, x1: Math.min(ax, bx), x2: Math.max(ax, bx), z1: Math.min(az, bz), z2: Math.max(az, bz) };
}

const LIGHTS: Record<string, readonly [number, number]> = {
  lantern: [15, 1],
  soul_lantern: [10, 1],
  campfire: [15, 1],
  ochre_froglight: [15, 0.9],
  glowstone: [15, 0.9],
  sea_lantern: [15, 0.8],
  jack_o_lantern: [15, 0.6],
  torch: [14, 1],
  wall_torch: [14, 1],
  end_rod: [14, 1],
};

const BYTE_LIGHT = 15;

function lightOf(name: string, props: Record<string, string>): [number, number] {
  const known = LIGHTS[name];
  if (known) return [known[0], known[1]];
  if (name.endsWith('candle') && props.lit === 'true')
    return [Math.min(BYTE_LIGHT, 3 * Number(props.candles ?? 1)), 1];
  if (['furnace', 'smoker', 'blast_furnace'].includes(name) && props.lit === 'true') return [13, 0];
  if (name === 'lava_cauldron') return [15, 0.9];
  return [0, 0];
}

const DYES = [
  'light_blue',
  'light_gray',
  'white',
  'orange',
  'magenta',
  'yellow',
  'lime',
  'pink',
  'gray',
  'cyan',
  'purple',
  'blue',
  'brown',
  'green',
  'red',
  'black',
];

/** Farbe vorn im Namen („light_blue_wool“ → light_blue), sonst weiß. */
function colourOf(name: string): string {
  return DYES.find((d) => name.startsWith(`${d}_`)) ?? 'white';
}

/** Teile für Blöcke, die kein ganzer Würfel sind. */
function partsOf(name: string, p: Record<string, string>): Part[] | undefined {
  const mat = material(name);
  const all = { side: mat };
  const facing = p.facing ?? 'north';
  if (name.endsWith('_stairs')) {
    const top = p.half === 'top';
    const lower = top ? box(0, 8, 0, 16, 16, 16, all) : box(0, 0, 0, 16, 8, 16, all);
    // Stufe auf der Seite, in die die Treppe schaut (Norden = z 0 … 8)
    const step = turn(top ? box(0, 0, 0, 16, 8, 8, all) : box(0, 8, 0, 16, 16, 8, all), facing);
    return [lower, step];
  }
  if (name.endsWith('_slab')) {
    if (p.type === 'double') return [box(0, 0, 0, 16, 16, 16, all)];
    return [p.type === 'top' ? box(0, 8, 0, 16, 16, 16, all) : box(0, 0, 0, 16, 8, 16, all)];
  }
  if (name.endsWith('_trapdoor')) {
    const t = { side: `${name}` };
    if (p.open === 'true') return [turn(box(0, 0, 13, 16, 16, 16, t), facing)];
    return [p.half === 'top' ? box(0, 13, 0, 16, 16, 16, t) : box(0, 0, 0, 16, 3, 16, t)];
  }
  if (name.endsWith('_door')) {
    const t = { side: `${name}_${p.half === 'upper' ? 'upper' : 'lower'}` };
    // geschlossene Tür: Blick nach Osten → an der Westseite (x 0 … 3)
    const rot: Record<string, string> = { east: 'west', west: 'east', north: 'south', south: 'north' };
    const shut = turn(box(0, 0, 13, 16, 16, 16, t), rot[facing] ?? 'north');
    return [shut];
  }
  if (name.endsWith('_carpet')) return [box(0, 0, 0, 16, 1, 16, { side: `${colourOf(name)}_wool` })];
  if (name === 'snow') return [box(0, 0, 0, 16, 2 * Number(p.layers ?? 1), 16, { side: 'snow' })];
  if (name.endsWith('pressure_plate')) return [box(1, 0, 1, 15, 1, 15, all)];
  if (name === 'lantern' || name === 'soul_lantern') {
    const dy = p.hanging === 'true' ? 1 : 0;
    const t = { side: name, top: 'lantern_top', bottom: 'lantern_top' };
    return [box(5, dy, 5, 11, dy + 7, 11, t), box(6, dy + 7, 6, 10, dy + 9, 10, { side: 'lantern_top' })];
  }
  if (name === 'iron_chain' || name === 'chain') return [box(7, 0, 7, 9, 16, 9, { side: 'chain' })];
  if (name === 'lightning_rod')
    return [
      box(7, 0, 7, 9, 13, 9, { side: 'copper_rod' }),
      box(6, 12, 6, 10, 16, 10, { side: 'copper_rod' }),
    ];
  if (name === 'campfire')
    return [
      box(1, 0, 4, 15, 4, 8, { side: 'campfire_log' }),
      box(1, 0, 9, 15, 4, 13, { side: 'campfire_log' }),
      box(4, 3, 1, 8, 7, 15, { side: 'campfire_log' }),
      box(9, 3, 1, 13, 7, 15, { side: 'campfire_log' }),
    ];
  if (name.endsWith('candle')) {
    const n = Number(p.candles ?? 1);
    const t = { side: name === 'candle' ? 'candle' : `${colourOf(name)}_candle`, top: 'candle_wick' };
    const spots: [number, number][] = [
      [7, 7],
      [5, 9],
      [9, 6],
      [8, 10],
    ];
    return spots.slice(0, n).map(([x, z], i) => box(x, 0, z, x + 2, 6 - i, z + 2, t));
  }
  if (name.endsWith('_bed')) {
    const wool = `${colourOf(name)}_wool`;
    const head = p.part === 'head';
    return [
      box(0, 3, 0, 16, 9, 16, { side: wool, top: head ? `bed_head_${colourOf(name)}` : wool }),
      ...[
        [0, 0],
        [13, 0],
        [0, 13],
        [13, 13],
      ].map(([x, z]) => box(x!, 0, z!, x! + 3, 3, z! + 3, { side: 'dark_oak_planks' })),
    ];
  }
  if (name === 'chest') return [box(1, 0, 1, 15, 14, 15, { side: 'chest', top: 'chest_top' })];
  if (name === 'cake') return [box(1, 0, 1, 15, 8, 15, { side: 'cake_side', top: 'cake_top' })];
  if (name === 'ladder')
    return [turn(box(0, 0, 15, 16, 16, 16, { side: 'ladder' }), facing === 'north' ? 'north' : facing)];
  if (name.endsWith('_wall_banner')) {
    const t = { side: `${colourOf(name)}_banner` };
    return [turn(box(1, -14, 14, 15, 14, 16, t), facing === 'north' ? 'north' : facing)];
  }
  if (name.endsWith('_banner')) {
    const t = { side: `${colourOf(name)}_banner` };
    return [
      box(7, 0, 7, 9, 28, 9, { side: 'dark_oak_planks' }),
      box(1, 4, 7, 15, 30, 8, t),
      box(0, 28, 7, 16, 30, 9, { side: 'dark_oak_planks' }),
    ];
  }
  if (name === 'skeleton_skull') return [box(4, 0, 4, 12, 8, 12, { side: 'bone' })];
  if (name === 'decorated_pot')
    return [
      box(1, 0, 1, 15, 14, 15, { side: 'decorated_pot' }),
      box(4, 14, 4, 12, 16, 12, { side: 'decorated_pot' }),
    ];
  if (name === 'bell')
    return [
      box(5, 4, 5, 11, 11, 11, { side: 'gold_block' }),
      box(7, 11, 7, 9, 16, 9, { side: 'dark_oak_planks' }),
    ];
  if (name === 'lectern')
    return [
      box(4, 0, 4, 12, 13, 12, { side: 'oak_planks' }),
      box(1, 13, 1, 15, 16, 15, { side: 'oak_planks' }),
    ];
  if (name === 'anvil')
    return [
      box(2, 0, 2, 14, 4, 14, { side: 'iron_dark' }),
      box(4, 4, 4, 12, 10, 12, { side: 'iron_dark' }),
      box(0, 10, 3, 16, 16, 13, { side: 'iron_dark' }),
    ];
  if (name === 'brewing_stand')
    return [box(7, 0, 7, 9, 14, 9, { side: 'chain' }), box(2, 0, 2, 14, 2, 14, { side: 'stone' })];
  if (name === 'grindstone')
    return [
      box(4, 4, 2, 12, 16, 14, { side: 'stone' }),
      box(2, 0, 6, 4, 10, 10, { side: 'dark_oak_planks' }),
      box(12, 0, 6, 14, 10, 10, { side: 'dark_oak_planks' }),
    ];
  if (name === 'stonecutter') return [box(0, 0, 0, 16, 9, 16, { side: 'stone', top: 'polished_andesite' })];
  if (name === 'flower_pot') return [box(5, 0, 5, 11, 6, 11, { side: 'flower_pot' })];
  return undefined;
}

const SOLID_CROSS_EXCEPT = new Set(['grass_block', 'snow_block', 'tall_grass_block']);

/** Färbung nach Gegend: Gras und Fels wechseln großflächig leicht den Ton, damit Hänge nicht wie Rauschen aussehen. */
const TINTS: Record<string, BlockInfo['tint']> = {
  grass_block: 'grass',
  stone: 'rock',
  andesite: 'rock',
  tuff: 'rock',
  cobblestone: 'rock',
  mossy_cobblestone: 'rock',
};

const PANE_TEX: Record<string, string> = { iron_bars: 'iron_bars', glass_pane: 'glass' };

export function classify(block: string): BlockInfo {
  const { name: raw, props } = parse(block);
  const name = raw;
  const [light, emit] = lightOf(name, props);
  const blank: Record<Face, string> = { top: '', bottom: '', north: '', south: '', east: '', west: '' };
  const base = {
    name,
    props,
    light,
    emit,
    window: false,
    tint: 'none' as BlockInfo['tint'],
    parts: [],
    tex: blank,
  };
  if (
    name === 'air' ||
    name === 'cave_air' ||
    name === 'light' ||
    name === 'barrier' ||
    name === 'structure_void'
  )
    return { ...base, kind: 'air', opaque: false, group: 'opaque' };
  if (name === 'water' || name === 'bubble_column')
    return { ...base, kind: 'water', opaque: false, group: 'water', tex: { ...blank, top: 'water' } };
  if (name.endsWith('_leaves'))
    return {
      ...base,
      kind: 'cube',
      opaque: true,
      group: 'opaque',
      tex: cubeTexAll(name, props),
      tint: 'leaves',
    };
  if (name.endsWith('_pane') || name === 'iron_bars') {
    const tex = PANE_TEX[name] ?? name.slice(0, -'_pane'.length);
    return {
      ...base,
      kind: 'pane',
      opaque: false,
      group: name === 'iron_bars' ? 'cutout' : 'glass',
      tex: { ...blank, top: tex },
      window: name !== 'iron_bars',
    };
  }
  if (name === 'glass' || name.endsWith('stained_glass') || name === 'ice')
    return {
      ...base,
      kind: 'glass',
      opaque: false,
      group: 'glass',
      tex: cubeTexAll(name, props),
      window: true,
    };
  if (name.endsWith('_fence'))
    return { ...base, kind: 'fence', opaque: false, group: 'opaque', tex: { ...blank, top: material(name) } };
  if (name.endsWith('_wall') && !name.endsWith('_wall_banner') && !name.endsWith('wall_torch'))
    return { ...base, kind: 'wall', opaque: false, group: 'opaque', tex: { ...blank, top: material(name) } };
  if (name.startsWith('potted_')) {
    const plant = name.slice('potted_'.length);
    return {
      ...base,
      kind: 'parts',
      opaque: false,
      group: 'opaque',
      parts: [box(5, 0, 5, 11, 6, 11, { side: 'flower_pot', top: 'potting_soil' })],
      cross: { tex: plant, y1: 4, y2: 14, scale: 0.6 },
    };
  }
  if (CROSS_PARTS.some((c) => name.includes(c)) && !SOLID_CROSS_EXCEPT.has(name)) {
    const half = props.half ? `_${props.half}` : '';
    const tint = name.includes('grass') || name.includes('fern') ? 'grass' : 'none';
    return {
      ...base,
      kind: 'cross',
      opaque: false,
      group: 'cutout',
      tint,
      cross: { tex: `${name}${half}`, y1: 0, y2: 16, scale: 1 },
    };
  }
  const parts = partsOf(name, props);
  if (parts) {
    const cutout =
      name === 'ladder' ||
      name.endsWith('_trapdoor') ||
      name.endsWith('_door') ||
      name === 'iron_chain' ||
      name === 'chain';
    const extra = name === 'campfire' ? { cross: { tex: 'fire', y1: 2, y2: 14, scale: 0.8 } } : {};
    return { ...base, kind: 'parts', opaque: false, group: cutout ? 'cutout' : 'opaque', parts, ...extra };
  }
  return {
    ...base,
    kind: 'cube',
    opaque: true,
    group: 'opaque',
    tex: cubeTexAll(name, props),
    tint: TINTS[name] ?? 'none',
  };
}

export function fenceParts(tex: string, link: Record<'north' | 'south' | 'east' | 'west', boolean>): Part[] {
  const t = { side: tex };
  const out: Part[] = [box(6, 0, 6, 10, 16, 10, t)];
  const arm = (dir: string, y1: number, y2: number): Part => {
    if (dir === 'north') return box(7, y1, 0, 9, y2, 6, t);
    if (dir === 'south') return box(7, y1, 10, 9, y2, 16, t);
    if (dir === 'east') return box(10, y1, 7, 16, y2, 9, t);
    return box(0, y1, 7, 6, y2, 9, t);
  };
  (Object.keys(link) as (keyof typeof link)[])
    .filter((d) => link[d])
    .forEach((d) => out.push(arm(d, 6, 9), arm(d, 12, 15)));
  return out;
}

export function wallParts(tex: string, link: Record<'north' | 'south' | 'east' | 'west', boolean>): Part[] {
  const t = { side: tex };
  const out: Part[] = [box(4, 0, 4, 12, 16, 12, t)];
  if (link.north) out.push(box(5, 0, 0, 11, 14, 4, t));
  if (link.south) out.push(box(5, 0, 12, 11, 14, 16, t));
  if (link.east) out.push(box(12, 0, 5, 16, 14, 11, t));
  if (link.west) out.push(box(0, 0, 5, 4, 14, 11, t));
  return out;
}

export function paneParts(tex: string, link: Record<'north' | 'south' | 'east' | 'west', boolean>): Part[] {
  const t = { side: tex, top: `${tex}#edge`, bottom: `${tex}#edge` };
  const any = link.north || link.south || link.east || link.west;
  const ns = link.north || link.south || !any;
  const ew = link.east || link.west || !any;
  const out: Part[] = [];
  if (ns) out.push(box(7, 0, link.north || !any ? 0 : 7, 9, 16, link.south || !any ? 16 : 9, t));
  if (ew) out.push(box(link.west || !any ? 0 : 7, 0, 7, link.east || !any ? 16 : 9, 16, 9, t));
  return out;
}
