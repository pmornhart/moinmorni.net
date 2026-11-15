/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/no-loop-statements, ts-patterns/no-nested-ternary -- render tool: Pixel- und Voxel-Schleifen */
/**
 * Eigene Block-Texturen (16 × 16 Pixel), nur aus Zahlen gemalt: Grundfarbe + Rauschen + einfache Muster (Bretter,
 * Rinde, Jahresringe, Ziegel, Kopfstein, Laub). Keine Datei aus Minecraft – sieht nach Klötzchenwelt aus, ist aber
 * unsere eigene Kunst und darf auf die Webseite.
 */

export type RGB = readonly [number, number, number];
/** 16 × 16 RGBA. */
export type Tile = Uint8ClampedArray;

const N = 16;

function hashString(s: string): number {
  let h = 2166136261;
  [...s].forEach((ch) => {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  });
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(n: number): RGB {
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function mul(c: RGB, f: number): RGB {
  return [c[0] * f, c[1] * f, c[2] * f];
}

class Painter {
  readonly px: Tile = new Uint8ClampedArray(N * N * 4);
  readonly r: () => number;
  constructor(key: string) {
    this.r = rng(hashString(key));
  }
  set(x: number, y: number, c: RGB, a = 255): void {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (y * N + x) * 4;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
    this.px[i + 3] = a;
  }
  get(x: number, y: number): RGB {
    const i = (((y + N) % N) * N + ((x + N) % N)) * 4;
    return [this.px[i]!, this.px[i + 1]!, this.px[i + 2]!];
  }
  alpha(x: number, y: number): number {
    return this.px[(y * N + x) * 4 + 3]!;
  }
  each(f: (x: number, y: number) => void): void {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) f(x, y);
  }
  /** Fläche mit Grundfarbe und feinem Rauschen (±amount). */
  noise(c: RGB, amount = 0.08): void {
    this.each((x, y) => this.set(x, y, mul(c, 1 + (this.r() * 2 - 1) * amount)));
  }
  shade(x: number, y: number, f: number): void {
    this.set(x, y, mul(this.get(x, y), f), this.alpha(x, y));
  }
  clear(): void {
    this.px.fill(0);
  }
}

/** Grundfarben der Materialien (unsere eigene Auswahl, leicht warm und freundlich). */
const BASE: Record<string, number> = {
  oak: 0xb08a55,
  spruce: 0x7a5636,
  birch: 0xd2c08a,
  dark_oak: 0x4e3420,
  mangrove: 0x8a3f33,
  jungle: 0xa8774f,
  acacia: 0xb8653a,
  cherry: 0xe0b2ad,
  stone: 0x8a8a87,
  andesite: 0x8d8e8a,
  polished_andesite: 0x9a9c97,
  tuff: 0x7a7c74,
  cobblestone: 0x7f7f7c,
  mossy_cobblestone: 0x74806a,
  stone_bricks: 0x8a8a86,
  mossy_stone_bricks: 0x7a8670,
  cracked_stone_bricks: 0x83837f,
  bricks: 0x9c5440,
  dirt: 0x86603f,
  coarse_dirt: 0x7a5839,
  gravel: 0x8a8580,
  sand: 0xdccf9e,
  clay: 0xa2a7b4,
  snow: 0xf3f6fa,
  calcite: 0xe2dfd5,
  white_concrete: 0xe6e4dd,
  smooth_quartz: 0xe0dbcf,
  quartz_block: 0xe0dbcf,
  oxidized_copper: 0x55a58e,
  copper: 0xc07a52,
  gold_block: 0xf0c64a,
  iron_block: 0xd8d8d8,
  emerald_block: 0x3fbf6a,
  diamond_block: 0x6fe0d8,
  redstone_block: 0xb02a1e,
  packed_ice: 0x9ec0ef,
  blue_ice: 0x7aaaf0,
  hay: 0xd2b13c,
  water: 0x2f6fbf,
  bone: 0xe6e0c8,
};

const DYE: Record<string, number> = {
  white: 0xeeeeea,
  orange: 0xe8792a,
  magenta: 0xc04fbf,
  light_blue: 0x5fb4e6,
  yellow: 0xf4cc3a,
  lime: 0x86c63a,
  pink: 0xee93b3,
  gray: 0x4a4f54,
  light_gray: 0x9c9c96,
  cyan: 0x2a9aa0,
  purple: 0x7c38ac,
  blue: 0x3a4ba6,
  brown: 0x7a5233,
  green: 0x56702c,
  red: 0xb03a30,
  black: 0x1c1c22,
};

const FLOWER: Record<string, number> = {
  poppy: 0xd8382c,
  red_tulip: 0xe0402e,
  dandelion: 0xf5d23a,
  pink_tulip: 0xf2a0c0,
  white_tulip: 0xf2f2ea,
  orange_tulip: 0xf09030,
  oxeye_daisy: 0xf5f3e8,
  allium: 0xb46ae0,
  azure_bluet: 0xe6ecf5,
  blue_orchid: 0x40a8e8,
  cornflower: 0x4a6ae6,
  lily_of_the_valley: 0xfafafa,
  flowering_azalea_bush: 0xe080c0,
};

const DYE_NAMES = Object.keys(DYE).sort((a, b) => b.length - a.length);

function dyeOf(key: string): RGB | undefined {
  const d = DYE_NAMES.find((n) => key.startsWith(`${n}_`));
  return d ? hex(DYE[d]!) : undefined;
}

const WOOD_NAMES = ['dark_oak', 'mangrove', 'spruce', 'birch', 'jungle', 'acacia', 'cherry', 'oak'];

function woodOf(key: string): string | undefined {
  return WOOD_NAMES.find((w) => key.includes(w));
}

// ---------- Muster ----------

function planks(p: Painter, c: RGB): void {
  p.noise(c, 0.05);
  p.each((x, y) => {
    const board = Math.floor(y / 4);
    const shift = (board * 7) % 16;
    const grain = Math.sin((x + board * 3) * 0.9 + board) * 0.04;
    p.shade(x, y, 1 + grain + (board % 2 === 0 ? 0.03 : -0.02));
    if (y % 4 === 3) p.shade(x, y, 0.72);
    if ((x + shift) % 16 === 0 && y % 4 !== 3) p.shade(x, y, 0.8);
  });
}

function bark(p: Painter, c: RGB, horizontal: boolean): void {
  p.noise(c, 0.06);
  const cols = Array.from({ length: N }, () => p.r());
  p.each((x, y) => {
    const u = horizontal ? y : x;
    const v = horizontal ? x : y;
    const stripe = cols[u]! < 0.3 ? 0.78 : cols[u]! > 0.8 ? 1.12 : 1;
    p.shade(x, y, stripe * (1 + Math.sin(v * 0.7 + u) * 0.03));
  });
}

function rings(p: Painter, bark: RGB, inner: RGB): void {
  p.each((x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (x === 0 || y === 0 || x === 15 || y === 15) p.set(x, y, mul(bark, 0.9 + p.r() * 0.15));
    else p.set(x, y, mul(inner, (Math.floor(d) % 2 === 0 ? 1 : 0.86) * (0.96 + p.r() * 0.08)));
  });
}

function bricks(p: Painter, c: RGB, mortar: RGB, bw: number, bh: number): void {
  p.each((x, y) => {
    const row = Math.floor(y / bh);
    const off = row % 2 === 0 ? 0 : bw / 2;
    const isMortar = y % bh === bh - 1 || (x + off) % bw === bw - 1;
    if (isMortar) p.set(x, y, mul(mortar, 0.95 + p.r() * 0.1));
    else {
      const brick = Math.floor((x + off) / bw) * 31 + row * 17;
      const tone = 0.92 + (((brick * 2654435761) % 1000) / 1000) * 0.14;
      p.set(x, y, mul(c, tone * (0.95 + p.r() * 0.08)));
      if (y % bh === 0) p.shade(x, y, 1.08);
    }
  });
}

function cobble(p: Painter, c: RGB, moss?: RGB): void {
  const seeds = Array.from({ length: 9 }, () => [p.r() * 16, p.r() * 16, 0.85 + p.r() * 0.3] as const);
  p.each((x, y) => {
    const ds = seeds
      .flatMap(([sx, sy, t]) =>
        [-16, 0, 16].flatMap((ox) =>
          [-16, 0, 16].map((oy) => ({ d: Math.hypot(x - sx - ox, y - sy - oy), t })),
        ),
      )
      .sort((a, b) => a.d - b.d);
    const edge = ds[1]!.d - ds[0]!.d < 1.1;
    let col = mul(c, ds[0]!.t * (0.94 + p.r() * 0.1));
    if (moss && p.r() < 0.35) col = mix(col, moss, 0.7);
    p.set(x, y, edge ? mul(c, 0.74) : col);
  });
}

function speckle(p: Painter, c: RGB, others: readonly RGB[], amount: number): void {
  p.noise(c, 0.08);
  p.each((x, y) => {
    if (p.r() < amount) p.set(x, y, mul(others[Math.floor(p.r() * others.length)]!, 0.9 + p.r() * 0.2));
  });
}

function leaves(p: Painter, c: RGB, blossom?: RGB): void {
  // dunkler Grund, darauf kleine Blattbüschel mit Licht oben links und Schatten unten rechts
  p.each((x, y) => p.set(x, y, mul(c, 0.5 + p.r() * 0.12)));
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(p.r() * 16);
    const y = Math.floor(p.r() * 16);
    const tone = 0.85 + p.r() * 0.35;
    const leaf = blossom && p.r() < 0.28 ? blossom : c;
    p.set(x, y, mul(leaf, tone * 1.18));
    p.set((x + 1) % 16, y, mul(leaf, tone));
    p.set(x, (y + 1) % 16, mul(leaf, tone * 0.95));
    p.set((x + 1) % 16, (y + 1) % 16, mul(leaf, tone * 0.78));
  }
}

function smooth(p: Painter, c: RGB, border = 0): void {
  p.noise(c, 0.025);
  if (border)
    p.each((x, y) => {
      if (x === 0 || y === 0) p.shade(x, y, 1 + border);
      if (x === 15 || y === 15) p.shade(x, y, 1 - border);
    });
}

/** Putz: fast glatt, mit feinen Flecken und etwas dunkleren Kanten, damit helle Wände in der Sonne nicht nur weiß sind. */
function plaster(p: Painter, c: RGB): void {
  p.noise(c, 0.035);
  p.each((x, y) => {
    if (p.r() < 0.07) p.shade(x, y, 0.93);
    if (x === 15 || y === 15) p.shade(x, y, 0.95);
  });
}

function grassTop(p: Painter): void {
  const g = hex(0x5a9338);
  p.each((x, y) => {
    const v = p.r();
    p.set(x, y, mul(g, v < 0.15 ? 0.8 : v > 0.9 ? 1.15 : 0.95 + p.r() * 0.1));
  });
}

function grassSide(p: Painter): void {
  speckle(p, hex(BASE.dirt!), [hex(0x6b4a2f), hex(0x9a7550)], 0.25);
  const g = hex(0x5a9338);
  for (let x = 0; x < N; x++) {
    const depth = 5 + Math.floor(p.r() * 4);
    for (let y = 0; y < depth; y++) p.set(x, y, mul(g, (y === depth - 1 ? 0.82 : 1) * (0.9 + p.r() * 0.15)));
  }
}

function water(p: Painter, still: boolean): void {
  const c = hex(BASE.water!);
  p.each((x, y) => {
    const w = Math.sin((x + y * 0.5) * 0.8) * 0.5 + Math.sin(y * 1.3 - x * 0.4) * 0.5;
    p.set(x, y, mul(c, 0.92 + w * 0.08 + p.r() * 0.04), still ? 255 : 190);
  });
}

function glass(p: Painter, tint: RGB, alpha: number): void {
  p.each((x, y) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    const glint = (x - y === 4 || x - y === 5 || x - y === -7) && !edge;
    if (edge) p.set(x, y, mul(tint, 0.8), 230);
    else if (glint) p.set(x, y, mix(tint, [255, 255, 255], 0.75), 170);
    else p.set(x, y, mix(tint, [255, 255, 255], 0.25), alpha);
  });
}

function stalk(p: Painter, x: number, y1: number, c: RGB): void {
  for (let y = y1; y < N; y++) p.set(x + (y % 5 === 0 ? 1 : 0), y, mul(c, 0.85 + p.r() * 0.2));
}

function flower(p: Painter, petal: RGB, centre: RGB): void {
  p.clear();
  const stem = hex(0x4f8a2e);
  stalk(p, 7, 7, stem);
  p.set(6, 11, stem);
  p.set(5, 10, stem);
  p.set(9, 12, stem);
  p.set(10, 11, stem);
  const blob: [number, number][] = [
    [7, 3],
    [8, 3],
    [6, 4],
    [7, 4],
    [8, 4],
    [9, 4],
    [6, 5],
    [7, 5],
    [8, 5],
    [9, 5],
    [7, 6],
    [8, 6],
    [7, 2],
    [5, 4],
    [10, 5],
  ];
  blob.forEach(([x, y]) => p.set(x, y, mul(petal, 0.85 + p.r() * 0.25)));
  p.set(7, 4, centre);
  p.set(8, 5, mul(centre, 0.9));
}

function grassBlades(p: Painter, tall: boolean): void {
  p.clear();
  const g = hex(0x6aa83c);
  for (let i = 0; i < (tall ? 9 : 7); i++) {
    const x = 1 + Math.floor(p.r() * 14);
    const top = tall ? Math.floor(p.r() * 4) : 4 + Math.floor(p.r() * 7);
    const lean = p.r() < 0.5 ? -1 : 1;
    for (let y = top; y < N; y++)
      p.set(x + (y < top + 3 ? lean : 0), y, mul(g, 0.75 + ((y - top) / 16) * 0.1 + p.r() * 0.3));
  }
}

function crop(p: Painter, head: RGB): void {
  p.clear();
  const stem = hex(0x7a9a3a);
  [2, 6, 10, 13].forEach((x) => {
    for (let y = 3; y < N; y++) p.set(x + (y % 4 === 0 ? 1 : 0), y, mul(stem, 0.85 + p.r() * 0.2));
    for (let y = 1; y < 6; y++) p.set(x, y, mul(head, 0.85 + p.r() * 0.25));
  });
}

function sugarCane(p: Painter): void {
  p.clear();
  const c = hex(0x8cc05a);
  [3, 8, 12].forEach((x) => {
    for (let y = 0; y < N; y++) {
      p.set(x, y, mul(c, y % 5 === 0 ? 0.7 : 0.95 + p.r() * 0.1));
      p.set(x + 1, y, mul(c, 0.8));
    }
  });
}

function fire(p: Painter): void {
  p.clear();
  for (let x = 2; x < 14; x++) {
    const h = 4 + Math.floor((1 - Math.abs(x - 7.5) / 7) * 10 * (0.6 + p.r() * 0.4));
    for (let y = N - h; y < N; y++) {
      const t = (y - (N - h)) / h;
      p.set(x, y, mix([255, 240, 160], [240, 110, 30], 1 - t));
    }
  }
}

function lantern(p: Painter, soul: boolean): void {
  const frame = hex(0x3a3a40);
  const glow: RGB = soul ? [140, 230, 255] : [255, 210, 120];
  p.each((x, y) => {
    const border = x <= 4 || x >= 11 || y <= 1 || y >= 13 || x === 7 || x === 8;
    if (border) p.set(x, y, mul(frame, 0.9 + p.r() * 0.2));
    else p.set(x, y, mix(glow, [255, 255, 230], (1 - Math.abs(y - 7) / 6) * 0.6));
  });
}

function door(p: Painter, c: RGB, window: boolean): void {
  planks(p, c);
  p.each((x, y) => {
    if (x === 0 || x === 15 || y === 0 || y === 15) p.shade(x, y, 0.7);
    if (window && x > 3 && x < 12 && y > 2 && y < 9) p.set(x, y, [0, 0, 0], 0);
  });
}

function trapdoor(p: Painter, c: RGB): void {
  planks(p, c);
  p.each((x, y) => {
    if (x === 0 || x === 15 || y === 0 || y === 15) p.shade(x, y, 0.72);
    else if ((x === 5 || x === 10) && y > 2 && y < 13) p.set(x, y, [0, 0, 0], 0);
  });
}

function ladder(p: Painter, c: RGB): void {
  p.clear();
  p.each((x, y) => {
    if (x === 2 || x === 3 || x === 12 || x === 13) p.set(x, y, mul(c, 0.9 + p.r() * 0.15));
    if (y % 4 === 1 && x > 1 && x < 14) p.set(x, y, mul(c, 1.05 + p.r() * 0.1));
  });
}

function bookshelf(p: Painter): void {
  planks(p, hex(BASE.oak!));
  const books = [0xa83a2e, 0x2f5fa0, 0x3f8a3a, 0xc9a23a, 0x6a3a8a, 0x8a5a2a].map(hex);
  [
    [1, 6],
    [9, 14],
  ].forEach(([y1, y2]) => {
    let x = 1;
    while (x < 15) {
      const w = 1 + Math.floor(p.r() * 2);
      const col = books[Math.floor(p.r() * books.length)]!;
      const top = y1! + Math.floor(p.r() * 2);
      for (let xx = x; xx < Math.min(15, x + w); xx++)
        for (let y = top; y <= y2!; y++) p.set(xx, y, mul(col, 0.85 + p.r() * 0.2));
      x += w;
    }
  });
}

function barrel(p: Painter, top: boolean): void {
  const c = hex(BASE.spruce!);
  if (top) {
    planks(p, c);
    p.each((x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) p.set(x, y, [60, 60, 64]);
    });
    return;
  }
  bark(p, c, false);
  p.each((x, y) => {
    if (y === 2 || y === 13) p.set(x, y, [70, 70, 74]);
  });
}

function furnace(p: Painter, front: boolean, lit: boolean): void {
  cobble(p, hex(0x7a7a78));
  if (!front) return;
  p.each((x, y) => {
    if (x > 3 && x < 12 && y > 7 && y < 13)
      p.set(x, y, lit ? mix([255, 180, 70], [200, 60, 20], p.r()) : [30, 30, 32]);
  });
}

function wool(p: Painter, c: RGB): void {
  p.noise(c, 0.06);
  p.each((x, y) => {
    if ((x + y * 3) % 5 === 0) p.shade(x, y, 0.9);
  });
}

function bedHead(p: Painter, c: RGB): void {
  wool(p, c);
  p.each((x, y) => {
    if (y < 7 && x > 1 && x < 14) p.set(x, y, mul([240, 238, 230], 0.95 + p.r() * 0.05));
  });
}

function banner(p: Painter, c: RGB): void {
  wool(p, c);
  p.each((x, y) => {
    if ((x + y) % 8 === 0 && y > 3) p.shade(x, y, 1.15);
  });
}

function cutCopper(p: Painter, c: RGB): void {
  p.noise(c, 0.07);
  p.each((x, y) => {
    if (x % 8 === 7 || y % 8 === 7) p.shade(x, y, 0.78);
    if (x % 8 === 0 || y % 8 === 0) p.shade(x, y, 1.08);
    if (p.r() < 0.06) p.set(x, y, mix(c, [130, 220, 190], 0.5));
  });
}

function oreless(p: Painter, c: RGB): void {
  p.noise(c, 0.045);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(p.r() * 15);
    const y = Math.floor(p.r() * 15);
    p.shade(x, y, 0.85);
    p.shade(x + 1, y, 0.9);
  }
}

function farmland(p: Painter): void {
  p.noise(hex(0x5e3f25), 0.08);
  p.each((x, y) => {
    if (y % 4 === 0) p.shade(x, y, 0.7);
  });
}

function hay(p: Painter, top: boolean): void {
  p.noise(hex(BASE.hay!), 0.1);
  p.each((x, y) => {
    if (!top && (y === 3 || y === 12)) p.set(x, y, [150, 50, 40]);
    if (top && (x + y) % 3 === 0) p.shade(x, y, 0.85);
  });
}

function pot(p: Painter): void {
  p.noise(hex(0x9a5a3c), 0.06);
  p.each((x, y) => {
    if (y < 2) p.shade(x, y, 1.12);
  });
}

function iron_bars(p: Painter): void {
  p.clear();
  const c = hex(0x5c5e64);
  p.each((x, y) => {
    if (x % 4 === 1 || y === 1 || y === 14) p.set(x, y, mul(c, 0.9 + p.r() * 0.2));
  });
}

function scaffolding(p: Painter): void {
  p.clear();
  const c = hex(0xd2b46a);
  p.each((x, y) => {
    if (x < 2 || x > 13 || y < 2 || y > 13 || x === y) p.set(x, y, mul(c, 0.9 + p.r() * 0.15));
  });
}

/** Malt die Kachel zu einem Schlüssel (siehe `blocks.ts`). */
export function paint(key: string): Tile {
  const p = new Painter(key);
  const [name, mode] = key.split('#') as [string, string | undefined];
  const wood = woodOf(name);
  const dye = dyeOf(name);
  const exact = BASE[name];

  if (name === 'grass_top') grassTop(p);
  else if (name === 'grass_side') grassSide(p);
  else if (name === 'dirt' || name === 'coarse_dirt' || name === 'potting_soil')
    speckle(
      p,
      hex(name === 'potting_soil' ? 0x4a3020 : BASE[name]!),
      [hex(0x5e4026), hex(0xa07a52)],
      name === 'coarse_dirt' ? 0.4 : 0.25,
    );
  else if (name === 'farmland') farmland(p);
  else if (name === 'gravel')
    speckle(p, hex(BASE.gravel!), [hex(0x6a6560), hex(0xb0aaa2), hex(0x8a7a6a)], 0.5);
  else if (name === 'sand' || name === 'clay')
    speckle(p, hex(BASE[name]!), [mul(hex(BASE[name]!), 0.9)], 0.3);
  else if (name === 'snow') speckle(p, hex(BASE.snow!), [hex(0xe6ecf5)], 0.15);
  else if (name === 'water' || name === 'water_still') water(p, name === 'water_still');
  else if (name === 'lava') speckle(p, [240, 120, 30], [[255, 200, 80]], 0.3);
  else if (name.endsWith('_leaves')) {
    const greens: Record<string, number> = {
      spruce: 0x2f5c34,
      oak: 0x36742c,
      birch: 0x7aa84a,
      dark_oak: 0x3d7a2a,
      azalea: 0x5e9a3a,
      flowering_azalea: 0x5e9a3a,
      mangrove: 0x5a9a30,
      cherry: 0xf0b0c8,
    };
    const kind = name.slice(0, -'_leaves'.length);
    leaves(p, hex(greens[kind] ?? 0x4e9a38), kind === 'flowering_azalea' ? hex(0xf07ac0) : undefined);
  } else if (name.endsWith('_log_top') || name.endsWith('_stem_top')) {
    const w = wood ?? 'oak';
    const stripped = name.startsWith('stripped_');
    rings(p, hex(BARK[w] ?? 0x5a4630), mul(hex(BASE[w] ?? 0xb08a55), stripped ? 1.05 : 1));
  } else if (name.endsWith('_log') || name.endsWith('_stem')) {
    const w = wood ?? 'oak';
    const stripped = name.startsWith('stripped_');
    bark(p, stripped ? hex(BASE[w] ?? 0xb08a55) : hex(BARK[w] ?? 0x5a4630), mode === 'h');
    if (w === 'birch' && !stripped)
      p.each((x, y) => {
        if (p.r() < 0.12) p.set(mode === 'h' ? y : x, mode === 'h' ? x : y, [40, 40, 36]);
      });
  } else if (name.endsWith('_planks')) planks(p, hex(BASE[wood ?? 'oak'] ?? 0xb08a55));
  else if (name.endsWith('_door_upper') || name.endsWith('_door_lower'))
    door(p, mul(hex(BASE[wood ?? 'spruce']!), 0.95), name.endsWith('_upper'));
  else if (name.endsWith('_trapdoor')) {
    if (name.includes('copper')) cutCopper(p, hex(BASE.oxidized_copper!));
    else trapdoor(p, hex(BASE[wood ?? 'spruce']!));
  } else if (name === 'ladder') ladder(p, hex(BASE.oak!));
  else if (name === 'bookshelf') bookshelf(p);
  else if (name === 'barrel' || name === 'barrel_top') barrel(p, name === 'barrel_top');
  else if (
    name.startsWith('furnace') ||
    name.startsWith('smoker') ||
    name.startsWith('blast_furnace') ||
    name.startsWith('dispenser')
  )
    furnace(p, name.includes('front'), name.endsWith('lit'));
  else if (name === 'cobblestone' || name === 'mossy_cobblestone')
    cobble(p, hex(BASE.cobblestone!), name.startsWith('mossy') ? hex(0x5f8a3a) : undefined);
  else if (name.endsWith('stone_bricks')) bricks(p, hex(BASE[name] ?? 0x8a8a86), hex(0x5e5e5a), 8, 4);
  else if (name === 'bricks') bricks(p, hex(BASE.bricks!), hex(0xb8ada0), 8, 4);
  else if (name === 'stone' || name === 'andesite' || name === 'tuff') oreless(p, hex(BASE[name]!));
  else if (name === 'polished_andesite') smooth(p, hex(BASE.polished_andesite!), 0.08);
  else if (name === 'calcite' || name === 'white_concrete' || name === 'smooth_quartz')
    plaster(p, hex(BASE[name]!));
  else if (name === 'quartz_block' || name === 'quartz_pillar' || name === 'quartz_pillar_top') {
    smooth(p, hex(BASE.quartz_block!), 0.05);
    if (name === 'quartz_pillar') p.each((x, y) => (x === 2 || x === 13 ? p.shade(x, y, 0.88) : undefined));
  } else if (
    name.includes('cut_copper') ||
    name === 'oxidized_copper' ||
    name === 'copper_block' ||
    name === 'copper_rod'
  )
    cutCopper(p, hex(name === 'copper_rod' ? BASE.copper! : BASE.oxidized_copper!));
  else if (name.endsWith('_wool')) wool(p, dye ?? hex(0xeeeeea));
  else if (name.endsWith('_concrete')) smooth(p, dye ?? hex(0xeeeeea));
  else if (name.endsWith('_terracotta'))
    speckle(p, mul(dye ?? hex(0xa05a3a), 0.8), [mul(dye ?? hex(0xa05a3a), 0.7)], 0.2);
  else if (name.startsWith('bed_head_')) bedHead(p, hex(DYE[name.slice('bed_head_'.length)] ?? 0xb03a30));
  else if (name.endsWith('_banner')) banner(p, dye ?? hex(0xeeeeea));
  else if (name.endsWith('_candle') || name === 'candle') smooth(p, dye ?? hex(0xe8dcc0));
  else if (name === 'candle_wick') p.noise([255, 220, 140], 0.05);
  else if (name === 'lantern' || name === 'soul_lantern') lantern(p, name === 'soul_lantern');
  else if (name === 'lantern_top' || name === 'chain' || name === 'iron_dark') p.noise(hex(0x3c3d44), 0.12);
  else if (name === 'iron_bars') iron_bars(p);
  else if (name === 'glass' || name.endsWith('stained_glass') || name === 'ice') {
    const tint = dye ?? hex(name === 'ice' ? 0xbcd8ff : 0xcfe6ee);
    glass(p, tint, name === 'glass' ? 70 : 140);
  } else if (mode === 'edge') smooth(p, mul(dye ?? hex(0xcfe6ee), 0.85));
  else if (name === 'chest' || name === 'chest_top') {
    planks(p, hex(0xa87638));
    p.each((x, y) => {
      if (name === 'chest' && y === 5) p.set(x, y, [60, 50, 40]);
      if (name === 'chest' && y > 3 && y < 8 && x > 6 && x < 9) p.set(x, y, [200, 200, 205]);
    });
  } else if (name === 'cake_side' || name === 'cake_top') {
    p.noise([245, 240, 232], 0.04);
    if (name === 'cake_side')
      p.each((x, y) => (y > 3 ? p.set(x, y, mul([200, 140, 90], 0.9 + p.r() * 0.15)) : undefined));
    else p.each((x, y) => (p.r() < 0.06 ? p.set(x, y, [220, 40, 50]) : undefined));
  } else if (name === 'flower_pot') pot(p);
  else if (name === 'decorated_pot') {
    pot(p);
    p.each((x, y) => (y % 5 === 2 ? p.shade(x, y, 0.7) : undefined));
  } else if (name === 'campfire_log') bark(p, hex(0x4a3a2a), true);
  else if (name === 'fire') fire(p);
  else if (name === 'hay_top' || name === 'hay') hay(p, name === 'hay_top');
  else if (name === 'scaffolding') scaffolding(p);
  else if (name === 'ochre_froglight') smooth(p, hex(0xf6e2a0), 0.1);
  else if (name === 'cauldron' || name === 'composter') {
    p.noise(name === 'cauldron' ? hex(0x45464c) : hex(0x7a5636), 0.08);
    p.each((x, y) => (x === 0 || x === 15 || y === 0 ? p.shade(x, y, 1.2) : undefined));
  } else if (name === 'pumpkin' || name === 'pumpkin_top' || name === 'melon' || name === 'melon_top') {
    const c = name.startsWith('pumpkin') ? hex(0xe08a28) : hex(0x6aa83a);
    p.noise(c, 0.06);
    if (!name.endsWith('_top')) p.each((x, y) => (x % 4 === 0 ? p.shade(x, y, 0.8) : undefined));
  } else if (
    name.endsWith('_table_top') ||
    name.endsWith('table') ||
    name === 'loom' ||
    name === 'loom_top' ||
    name === 'note_block' ||
    name === 'jukebox' ||
    name === 'jukebox_top' ||
    name === 'note_block_top'
  ) {
    planks(p, hex(BASE.oak!));
    p.each((x, y) => (x === 0 || y === 0 || x === 15 || y === 15 ? p.shade(x, y, 0.7) : undefined));
  } else if (name === 'target') {
    p.noise([235, 225, 210], 0.04);
    p.each((x, y) => {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < 2 || (d > 4 && d < 6)) p.set(x, y, [200, 40, 40]);
    });
  } else if (name === 'grass' || name === 'short_grass' || name === 'fern') grassBlades(p, false);
  else if (name.startsWith('tall_grass') || name.startsWith('large_fern')) grassBlades(p, true);
  else if (name === 'sugar_cane') sugarCane(p);
  else if (name.startsWith('wheat')) crop(p, hex(0xd6b44a));
  else if (name.startsWith('carrots')) crop(p, hex(0x4f9a2e));
  else if (
    name.endsWith('_sapling') ||
    name === 'azalea_bush' ||
    name === 'flowering_azalea_bush' ||
    name === 'cactus'
  ) {
    p.clear();
    leaves(p, hex(0x5e9a3a), name.startsWith('flowering') ? hex(0xf07ac0) : undefined);
    p.each((x, y) => {
      if (Math.hypot(x - 7.5, y - 6) > 6.5) p.set(x, y, [0, 0, 0], 0);
    });
  } else if (FLOWER[name] !== undefined)
    flower(
      p,
      hex(FLOWER[name]!),
      name === 'oxeye_daisy' || name === 'azure_bluet' ? hex(0xf2c230) : hex(0xffe39a),
    );
  else if (name === 'bone') p.noise(hex(BASE.bone!), 0.05);
  else if (exact !== undefined) smooth(p, hex(exact), 0.06);
  else if (dye) smooth(p, dye);
  else if (wood) planks(p, hex(BASE[wood]!));
  else p.noise(hex(0x9a9a96), 0.08);
  return p.px;
}

const BARK: Record<string, number> = {
  oak: 0x6a5232,
  spruce: 0x4a3420,
  birch: 0xe6e2d6,
  dark_oak: 0x3a2a18,
  mangrove: 0x5a3a2a,
  jungle: 0x5a4a2a,
  acacia: 0x6a6258,
  cherry: 0x3a2228,
};

export const TILE = N;
