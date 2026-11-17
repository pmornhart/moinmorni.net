/* eslint-disable ts-patterns/no-magic-numbers -- Modell-Maße in 1/16 Block (Minecraft-Modellkoordinaten) */
import type { Canvas } from './canvas.js';
import { disc, range } from './range.js';
import { lobbyTags } from './lobby-tags.js';

/**
 * Prunkbrunnen als eigenes 3D-Modell im Ressourcenpaket der Lobby (Philip: „schöner, reicher, edler – mit dem
 * Ressourcenpaket, nicht aus Minecraft-Blöcken nachgebaut“).
 *
 * Marmorbecken mit Goldkante und Sitzrand, Säule, große Schale mit Perlenkranz, kleine Schale, goldene Krone mit
 * Smaragden; Wasser fällt als Schleier von beiden Schalen, vier goldene Vasen spritzen ins Becken. Alles sind
 * Anzeige-Objekte (`item_display`) mit eigenen Modellen über das leere Luft-Modell (wie die Trachten) – ohne Paket
 * unsichtbar. Runde Teile außen sind Segmente, die um die Mitte gedreht stehen; kleine runde Teile entstehen im Modell
 * aus acht gedrehten Brettern (das ergibt ein genaues 16-Eck).
 *
 * Ohne Paket (oder auf Bedrock) bleibt ein schlichter Brunnen aus Blöcken: Rand aus Tuffziegel-Mauern, Säule, Endstab
 * als Fontäne. Diese Blöcke gibt es in der Lobby nur hier – das Paket macht sie unsichtbar (sie haben keine volle
 * Seitenfläche, darum entstehen daneben keine Löcher im Boden). Das Wasser im Becken ist echtes Wasser.
 *
 * Texturen: nur Verweise auf Texturen, die jedes Minecraft mitbringt (Quarz, Gold, Wasser, Smaragd, Diamant, Wolle).
 * Maße in 1/16 Block („px“), y = 0 ist die Höhe, auf der man neben dem Brunnen steht.
 */

export type Vec = readonly [number, number, number];
export type Face = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
export type Tex =
  | 'marmor'
  | 'zier'
  | 'gold'
  | 'wasser'
  | 'flut'
  | 'smaragd'
  | 'diamant'
  | 'samt'
  | 'kalk'
  | 'ziegel'
  | 'zierstein'
  | 'glatt'
  | 'kupfer';

const TEXTURES: Readonly<Record<Tex, string>> = {
  marmor: 'minecraft:block/quartz_block_side',
  zier: 'minecraft:block/chiseled_quartz_block',
  gold: 'minecraft:block/gold_block',
  wasser: 'minecraft:block/water_still',
  flut: 'minecraft:block/water_flow',
  smaragd: 'minecraft:block/emerald_block',
  diamant: 'minecraft:block/diamond_block',
  samt: 'minecraft:block/blue_wool',
  // Dorfbrunnen (dorfbrunnen.ts): heller Kalkstein, Steinziegel, Zierstein, glatter Stein, Kupfer mit Patina
  kalk: 'minecraft:block/calcite',
  ziegel: 'minecraft:block/stone_bricks',
  zierstein: 'minecraft:block/chiseled_stone_bricks',
  glatt: 'minecraft:block/smooth_stone',
  kupfer: 'minecraft:block/weathered_copper',
};
/** Wasser-Texturen sind grau – eingefärbt über `tintindex` 0 (stehendes Wasser) bzw. 1 (fallendes Wasser). */
const TINTED: ReadonlySet<Tex> = new Set<Tex>(['wasser', 'flut']);
/** Türkis wie in einem gepflegten Schlossbrunnen. */
export const WASSER_FARBE = 0x4aa8e8;
/** Fallendes Wasser: heller, fast weiß schäumend. */
export const STRAHL_FARBE = 0xc4ecff;

/** Blöcke des Brunnens ohne Paket – das Paket blendet sie aus (gibt es in der Lobby nur am Brunnen). */
export const BRUNNEN_ERSATZ = { rand: 'tuff_brick_wall', fontaene: 'end_rod[facing=up]' } as const;

export interface Box {
  readonly from: Vec;
  readonly to: Vec;
  readonly tex: Tex;
  /** Drehung um y oder z in 22,5°-Schritten (-45 … 45) um `origin`. */
  readonly rot?: { readonly axis: 'y' | 'z'; readonly angle: number; readonly origin: Vec };
  readonly faces?: readonly Face[];
}

const ALL_FACES: readonly Face[] = ['north', 'south', 'east', 'west', 'up', 'down'];
export const BLOCK = 16;
const HALF = 8;
/** Ein Modell darf von -16 bis 32 reichen: um die Mitte (8) also ±24. */
export const MODEL_REACH = 24;
const q = (n: number): number => Math.round(n * 1000) / 1000;
const shift = (v: Vec): number[] => v.map((n) => q(n + HALF));

/** Ausschnitt der Textur (0 … 16): kurze Flächen wie in der Welt, lange gestreckt. */
function span(a: number, b: number): [number, number] {
  const lo = Math.min(a, b);
  const width = Math.abs(b - a);
  if (width >= BLOCK) return [0, BLOCK];
  const start = ((lo % BLOCK) + BLOCK) % BLOCK;
  const s = start + width > BLOCK ? BLOCK - width : start;
  return [q(s), q(s + width)];
}

function uvOf(b: Box, face: Face): [number, number, number, number] {
  const [x1, y1, z1] = b.from;
  const [x2, y2, z2] = b.to;
  const pick: Readonly<Record<Face, [number, number, number, number]>> = {
    north: [-x2, -y2, -x1, -y1],
    south: [x1, -y2, x2, -y1],
    east: [-z2, -y2, -z1, -y1],
    west: [z1, -y2, z2, -y1],
    up: [x1, z1, x2, z2],
    down: [x1, -z2, x2, -z1],
  };
  const [a1, b1, a2, b2] = pick[face];
  const [u1, u2] = span(a1, a2);
  const [v1, v2] = span(b1, b2);
  return [u1, v1, u2, v2];
}

function element(b: Box): Record<string, unknown> {
  const flat = b.from[1] === b.to[1];
  const faces = b.faces ?? (flat ? (['up'] as const) : ALL_FACES);
  return {
    from: shift(b.from),
    to: shift(b.to),
    ...(b.rot ? { rotation: { axis: b.rot.axis, angle: b.rot.angle, origin: shift(b.rot.origin) } } : {}),
    faces: Object.fromEntries(
      faces.map((f) => [
        f,
        {
          uv: uvOf(b, f),
          texture: `#${b.tex}`,
          ...(TINTED.has(b.tex) ? { tintindex: b.tex === 'flut' ? 1 : 0 } : {}),
        },
      ]),
    ),
  };
}

/** Item-Modell im Minecraft-Format (Koordinaten um die Mitte des Anzeige-Objekts). */
export function brunnenModelJson(boxes: readonly Box[]): Record<string, unknown> {
  const used = [...new Set(boxes.map((b) => b.tex))];
  return {
    textures: { particle: TEXTURES.marmor, ...Object.fromEntries(used.map((t) => [t, TEXTURES[t]])) },
    elements: boxes.map(element),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Formen
// ---------------------------------------------------------------------------------------------------------------

/** Ein Ring im Querschnitt: von Radius r1 bis r2, Höhe y1 bis y2. */
export interface Ring {
  readonly r1: number;
  readonly r2: number;
  readonly y1: number;
  readonly y2: number;
  readonly tex: Tex;
  readonly faces?: readonly Face[];
}

/**
 * Ein Segment (1/n) eines großen Rings, als gerades Stück: außen bündig mit dem Vieleck um den Kreis r2, innen
 * überlappend. `rc` = Abstand des Anzeige-Objekts von der Mitte, `lift` hebt jedes zweite Segment um einen Hauch an
 * (sonst flimmern die überlappenden Flächen benachbarter Segmente).
 */
export function segment(rings: readonly Ring[], n: number, rc: number, lift: number): Box[] {
  const t = Math.tan(Math.PI / n);
  return rings.map((g) => {
    const w = g.r2 * t + 0.02;
    return {
      from: [g.r1 - rc, g.y1 - lift, -w],
      to: [g.r2 - rc, g.y2 + lift, w],
      tex: g.tex,
      ...(g.faces ? { faces: g.faces } : {}),
    };
  });
}

/** Rundes Stück (16-Eck mit Inkreis r) aus acht gedrehten Brettern, jedes einen Hauch höher (kein Flimmern). */
export function round(r: number, y1: number, y2: number, tex: Tex): Box[] {
  const w = r * Math.tan(Math.PI / 16);
  const plank = (along: 'x' | 'z', angle: number, k: number): Box => {
    const e = k * 0.02;
    const [hx, hz] = along === 'x' ? [r, w] : [w, r];
    return {
      from: [-hx, y1 - e, -hz],
      to: [hx, y2 + e, hz],
      tex,
      ...(angle ? { rot: { axis: 'y' as const, angle, origin: [0, y1, 0] as Vec } } : {}),
    };
  };
  return [
    plank('x', 0, 0),
    plank('x', 22.5, 1),
    plank('x', 45, 2),
    plank('z', -22.5, 3),
    plank('z', 0, 4),
    plank('z', 22.5, 5),
    plank('x', -45, 6),
    plank('x', -22.5, 7),
  ];
}

/** Richtung k·(360/n)° als Grundachse (+x, +z, −x, −z) plus erlaubte Drehung (−45 … 22,5). */
function direction(k: number, n: number): { readonly base: 0 | 1 | 2 | 3; readonly angle: number } {
  const deg = (k * 360) / n;
  const quarter = Math.round(deg / 90);
  return { base: (quarter % 4) as 0 | 1 | 2 | 3, angle: deg - quarter * 90 };
}

/** Kasten in Richtung `base` (radial a1 … a2, quer ±half) – die Grundachsen sind nur Vertauschungen. */
function radialBox(
  base: 0 | 1 | 2 | 3,
  a1: number,
  a2: number,
  half: number,
  y1: number,
  y2: number,
): [Vec, Vec] {
  const boxes: Readonly<Record<0 | 1 | 2 | 3, [Vec, Vec]>> = {
    0: [
      [a1, y1, -half],
      [a2, y2, half],
    ],
    1: [
      [-half, y1, a1],
      [half, y2, a2],
    ],
    2: [
      [-a2, y1, -half],
      [-a1, y2, half],
    ],
    3: [
      [-half, y1, -a2],
      [half, y2, -a1],
    ],
  };
  return boxes[base];
}

/** Die Fläche, die bei Grundachse `base` nach außen zeigt. */
const OUTWARD: Readonly<Record<0 | 1 | 2 | 3, Face>> = { 0: 'east', 1: 'south', 2: 'west', 3: 'north' };

/**
 * Ring aus n Kanten (16 oder 8) im Modell selbst: zwischen r1 und r2, jede Kante quer so lang wie die Seite des
 * Vielecks um r2. Benachbarte Kanten abwechselnd einen Hauch höher. `outwardOnly` für Wasserschleier (nur die
 * Außenseite, sonst sieht man ihn doppelt).
 */
function ringRound(
  r1: number,
  r2: number,
  y1: number,
  y2: number,
  tex: Tex,
  n = 16,
  outwardOnly = false,
): Box[] {
  const half = r2 * Math.tan(Math.PI / n) + 0.02;
  return range(0, n - 1).map((k) => {
    const { base, angle } = direction(k, n);
    const lift = (k % 2) * 0.04;
    const [from, to] = radialBox(base, r1, r2, half, y1 - lift, y2 + lift);
    return {
      from,
      to,
      tex,
      ...(angle ? { rot: { axis: 'y' as const, angle, origin: [0, y1, 0] as Vec } } : {}),
      ...(outwardOnly ? { faces: [OUTWARD[base]] } : {}),
    };
  });
}

/** Kleine Kästchen rundum (Perlen, Edelsteine): n Stück auf Radius r1 … r2, quer ±half. */
function studs(
  n: number,
  r1: number,
  r2: number,
  half: number,
  y1: number,
  y2: number,
  tex: (k: number) => Tex,
): Box[] {
  return range(0, n - 1).map((k) => {
    const { base, angle } = direction(k, n);
    const [from, to] = radialBox(base, r1, r2, half, y1, y2);
    return {
      from,
      to,
      tex: tex(k),
      ...(angle ? { rot: { axis: 'y' as const, angle, origin: [0, y1, 0] as Vec } } : {}),
    };
  });
}

/** n Wasserstrahlen rundum (nur die Außenseite), die von einem Schalenrand hinabfallen. */
function streams(n: number, r: number, half: number, y1: number, y2: number): Box[] {
  return range(0, n - 1).map((k) => {
    const { base, angle } = direction(k, n);
    const [from, to] = radialBox(base, r, r + 0.3, half, y1, y2);
    return {
      from,
      to,
      tex: 'flut' as const,
      faces: [OUTWARD[base]],
      ...(angle ? { rot: { axis: 'y' as const, angle, origin: [0, y1, 0] as Vec } } : {}),
    };
  });
}

/** Wasserfläche (oder Boden) als Kreis aus nicht überlappenden Streifen – durchscheinend darf nichts doppelt liegen. */
function discRows(r: number, y: number, tex: Tex, step = 1): Box[] {
  const rows = Math.ceil((2 * r) / step);
  return range(0, rows - 1).map((i) => {
    const z1 = -r + i * step;
    const z2 = Math.min(r, z1 + step);
    const near = z1 < 0 && z2 > 0 ? 0 : Math.min(Math.abs(z1), Math.abs(z2));
    const half = Math.sqrt(Math.max(0, r * r - near * near));
    return { from: [-half, y, z1] as Vec, to: [half, y, z2] as Vec, tex, faces: ['up'] as const };
  });
}

/** Drehsinn von Minecraft um z: so neigt sich ein Stück, das zur Mitte hin steigt, mit dem inneren Ende nach oben. */
const Z_TILT = -1;

/** Wasserstrahl als Bogen in der Ebene radial/oben: Punkte → Stücke mit erlaubten Neigungen (−45 … 45°). */
function jet(points: readonly (readonly [number, number])[], thickness: number): Box[] {
  return points.slice(1).map(([x2, y2], i) => {
    const [x1, y1] = points[i] ?? [x2, y2];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    // Neigung des Stücks, auf 22,5° gerundet; Richtung nach −x (zur Mitte) → Winkel spiegeln
    const slope = (Math.atan2(dy, -dx) * 180) / Math.PI;
    const angle = Math.max(-45, Math.min(45, Math.round(slope / 22.5) * 22.5));
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const t = thickness / 2;
    return {
      from: [cx - length / 2, cy - t, -t] as Vec,
      to: [cx + length / 2, cy + t, t] as Vec,
      tex: 'flut' as const,
      rot: { axis: 'z' as const, angle: Z_TILT * angle, origin: [cx, cy, 0] as Vec },
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Die Teile
// ---------------------------------------------------------------------------------------------------------------

/** Größe des Brunnens: im Schlosshof groß (mit Vasen), in der Rotunde kleiner. */
export type BrunnenGroesse = 'gross' | 'klein';

interface Measures {
  /** Becken: Innenkante, Außenkante (px) */
  readonly inner: number;
  readonly outer: number;
  /** Segmente des Beckenrands */
  readonly rimParts: number;
  /** Echtes Wasser in Blöcken bis zu diesem Abstand (Blockmitten), Ersatz-Rand bis `rimBlocks`. */
  readonly water: number;
  readonly rimBlocks: number;
  /** Säule bis zur großen Schale (nur „gross“) bzw. zur Schale */
  readonly columnTop: number;
  readonly bigBowl: boolean;
  readonly crownScale: number;
  readonly vases: boolean;
}

const MEASURES: Readonly<Record<BrunnenGroesse, Measures>> = {
  gross: {
    inner: 52,
    outer: 76,
    rimParts: 24,
    // Wasser bis 3,9: auf den Achsen liegt sonst Wasser bei 4, ohne Rand dahinter (es liefe beim nächsten Update aus)
    water: 3.9,
    rimBlocks: 4.9,
    columnTop: 33,
    bigBowl: true,
    crownScale: 1.6,
    vases: true,
  },
  klein: {
    inner: 29,
    outer: 52,
    rimParts: 16,
    water: 2.5,
    rimBlocks: 3.3,
    columnTop: 24,
    bigBowl: false,
    crownScale: 1.3,
    vases: false,
  },
};

/** Wasserspiegel im Becken: echtes Wasser (14/16 Block hoch). */
const BASIN_WATER = 14;
/** Große Schale: Boden, Wasser, Rand */
const BOWL = { floor: 44, water: 44.6, rimTop: 47, radius: 33.5, outer: 38 } as const;

function rimRings(m: Measures): Ring[] {
  const { inner, outer } = m;
  return [
    { r1: outer - 12, r2: outer, y1: 0, y2: 3, tex: 'marmor' },
    { r1: inner, r2: outer - 3, y1: 0, y2: 15, tex: 'marmor' },
    { r1: outer - 3.5, r2: outer - 2.5, y1: 8, y2: 10, tex: 'gold' },
    { r1: inner - 2, r2: outer - 2, y1: 15, y2: 18.5, tex: 'marmor' },
    { r1: outer - 2, r2: outer - 1, y1: 15, y2: 18.5, tex: 'gold' },
    { r1: inner - 2.5, r2: inner - 1.5, y1: 15.5, y2: 18, tex: 'gold' },
  ];
}

/** Säule im Becken (bei „gross“ mit dem Kern der großen Schale). */
function columnBoxes(m: Measures): Box[] {
  const top = m.columnTop;
  const core = m.bigBowl ? round(13, top - 2, BOWL.floor, 'marmor') : [];
  return [
    ...round(m.bigBowl ? 13 : 10, 0, 3, 'marmor'),
    ...round(m.bigBowl ? 11 : 8.5, 3, 5, 'gold'),
    ...round(m.bigBowl ? 7.5 : 6, 5, top - 3, 'zier'),
    ...round(12, 12.5, 15.2, 'gold'),
    ...round(m.bigBowl ? 9 : 7.5, top - 7, top - 5, 'gold'),
    ...round(m.bigBowl ? 11 : 9, top - 5, top - 2, 'marmor'),
    ...round(m.bigBowl ? 12.5 : 10, top - 2, top, 'gold'),
    ...core,
  ];
}

/** Unterseite der großen Schale: von innen nach außen immer flacher (wirkt geschwungen). */
const BOWL_STEPS: ReadonlyArray<readonly [number, number, number]> = [
  [12, 18, 36],
  [18, 23, 38],
  [23, 27, 39.5],
  [27, 31, 41],
  [31, 34, 42],
];

/** Segment der großen Schale: geschwungene Unterseite mit goldener Rippe, Rand mit Goldkante. */
function bowlRings(): Ring[] {
  const noTop: readonly Face[] = ['north', 'south', 'east', 'west', 'down'];
  return [
    ...BOWL_STEPS.map(([r1, r2, y1]): Ring => ({ r1, r2, y1, y2: BOWL.floor, tex: 'marmor', faces: noTop })),
    { r1: 33.5, r2: 37.5, y1: 42, y2: 46.2, tex: 'marmor' },
    { r1: 37.2, r2: 37.8, y1: 43.4, y2: 44, tex: 'gold' },
    { r1: 33, r2: 38, y1: 46.2, y2: BOWL.rimTop, tex: 'gold' },
  ];
}

/** Goldene Rippe unter jedem Segment (folgt den Stufen der Unterseite). */
function bowlRib(rc: number): Box[] {
  return BOWL_STEPS.map(([r1, r2, y1]) => ({
    from: [r1 - rc, y1 - 0.25, -0.45] as Vec,
    to: [r2 - rc, y1 + 0.2, 0.45] as Vec,
    tex: 'gold' as const,
    faces: ['down', 'east', 'north', 'south'] as const,
  }));
}

/** Schale mit Stiel, Wasser, Rand, Perlen und Schleier hinab bis `fallTo` (oberer Teil, ein Anzeige-Objekt). */
function upperBoxes(stemFrom: number, fallTo: number): { readonly boxes: Box[]; readonly water: number } {
  const b = stemFrom + 11;
  return {
    water: b + 7.6,
    boxes: [
      ...round(5, stemFrom, b + 1, 'marmor'),
      ...round(6, stemFrom + 4, stemFrom + 6, 'gold'),
      ...round(9, b, b + 3, 'marmor'),
      ...round(15.5, b + 2, b + 7.4, 'marmor'),
      ...ringRound(15.5, 18.5, b + 3, b + 8.5, 'marmor'),
      ...ringRound(15, 19, b + 8.5, b + 9.5, 'gold'),
      ...studs(16, 18.5, 19.3, 0.8, b + 5, b + 6.5, () => 'gold'),
      ...discRows(15.8, b + 7.6, 'wasser'),
      ...streams(8, 19.6, 1.3, fallTo, b + 9.3),
    ],
  };
}

/** Krone: Kissen, Reif mit Smaragden und Diamanten, blauer Samt, acht Bügel, Reichsapfel mit Kreuz. */
function crownBoxes(): Box[] {
  const arch = (k: number): Box[] => {
    const { base, angle } = direction(k, 8);
    const parts: ReadonlyArray<readonly [number, number, number, number]> = [
      [6.2, 7.6, 6, 10],
      [4.5, 6.8, 9.6, 12],
      [2, 4.8, 11.6, 13.5],
      [0, 2.4, 13.1, 14.5],
    ];
    return parts.map(([a1, a2, y1, y2]) => {
      const [from, to] = radialBox(base, a1, a2, 0.7, y1, y2);
      return {
        from,
        to,
        tex: 'gold' as const,
        ...(angle ? { rot: { axis: 'y' as const, angle, origin: [0, y1, 0] as Vec } } : {}),
      };
    });
  };
  return [
    ...round(6, 0, 2, 'gold'),
    ...ringRound(6.5, 8, 2, 6, 'gold'),
    ...studs(8, 8, 8.8, 0.8, 3, 5, (k) => (k % 2 ? 'diamant' : 'smaragd')),
    ...round(6.2, 2, 9, 'samt'),
    ...round(4.5, 9, 11, 'samt'),
    ...range(0, 7).flatMap(arch),
    ...round(2.2, 14.5, 18.5, 'gold'),
    { from: [-0.6, 18.5, -0.6], to: [0.6, 24, 0.6], tex: 'gold' },
    { from: [-2, 21, -0.6], to: [2, 22.2, 0.6], tex: 'gold' },
  ];
}

/** Wie weit der Strahl einer Vase zur Mitte hin reicht (px). */
const vaseReach = (m: Measures): number => m.outer - 14 - (m.inner - 8);

/** Vase auf dem Rand mit Wasserstrahl ins Becken (lokal: +x nach außen, Strahl nach −x). */
function vaseBoxes(m: Measures): Box[] {
  const base = 18.5;
  const reach = vaseReach(m);
  const points = range(0, 6).map((i): [number, number] => {
    const t = i / 6;
    return [-reach * t, base + 11 + 8 * t - (base + 11 + 8 - BASIN_WATER) * t * t];
  });
  return [
    ...round(2.8, base, base + 1.5, 'gold'),
    ...round(4, base + 1.5, base + 7.5, 'marmor'),
    ...round(4.4, base + 4, base + 5, 'gold'),
    ...round(2.3, base + 7.5, base + 9.5, 'gold'),
    ...round(3.4, base + 9.5, base + 10.5, 'gold'),
    ...jet(points, 1.4),
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// Modelle und Aufstellen
// ---------------------------------------------------------------------------------------------------------------

/** Ein Modell mit seiner Höhe: Kästen sind schon um die Mitte des Anzeige-Objekts verschoben. */
export interface Part {
  readonly boxes: readonly Box[];
  /** Höhe der Mitte über y = 0 (px) */
  readonly centre: number;
}

export function centred(boxes: readonly Box[]): Part {
  const ys = boxes.flatMap((b) => [b.from[1], b.to[1]]);
  const centre = (Math.min(...ys) + Math.max(...ys)) / 2;
  const move = (v: Vec): Vec => [v[0], v[1] - centre, v[2]];
  return {
    centre,
    boxes: boxes.map((b) => ({
      ...b,
      from: move(b.from),
      to: move(b.to),
      ...(b.rot ? { rot: { ...b.rot, origin: move(b.rot.origin) } } : {}),
    })),
  };
}

const rimRc = (m: Measures): number => (m.inner - 2.5 + m.outer) / 2;
const BOWL_PARTS = 16;
const BOWL_RC = 19;
const CURTAIN_R = 38.8;
/** Wasserstrahlen von der großen Schale: so viele, so breit (halbe Breite, px). */
const STREAMS = 8;
const STREAM_HALF = 1.6;

/** Oberer Teil: Stiel ab Boden der großen Schale (bzw. ab Säule), Schleier fällt in die große Schale bzw. ins Becken. */
function upperOf(m: Measures): { readonly boxes: Box[]; readonly water: number } {
  return m.bigBowl ? upperBoxes(BOWL.floor, BOWL.water + 0.6) : upperBoxes(m.columnTop, BASIN_WATER + 0.5);
}

function partsOf(size: BrunnenGroesse): Readonly<Record<string, Part>> {
  const m = MEASURES[size];
  const rim = (lift: number): Part => centred(segment(rimRings(m), m.rimParts, rimRc(m), lift));
  const top = upperOf(m);
  const parts: Record<string, Part> = {
    [`rand_${size}_a`]: rim(0),
    [`rand_${size}_b`]: rim(0.06),
    [`saeule_${size}`]: centred(columnBoxes(m)),
    [`oben_${size}`]: centred(top.boxes),
  };
  const big: Record<string, Part> = m.bigBowl
    ? {
        schale_a: centred([
          ...segment(bowlRings(), BOWL_PARTS, BOWL_RC, 0),
          ...bowlRib(BOWL_RC),
          { from: [37.5 - BOWL_RC, 44.4, -1], to: [38.5 - BOWL_RC, 45.8, 1], tex: 'gold' },
        ]),
        schale_b: centred([
          ...segment(bowlRings(), BOWL_PARTS, BOWL_RC, 0.06),
          ...bowlRib(BOWL_RC),
          { from: [37.5 - BOWL_RC, 44.4, -1], to: [38.5 - BOWL_RC, 45.8, 1], tex: 'gold' },
        ]),
        // Boden und Wasser der großen Schale: halb so groß gezeichnet, doppelt so groß aufgestellt (Radius > 24)
        schale_wasser: centred([
          ...discRows(BOWL.radius / 2, 0, 'marmor', 0.5),
          ...discRows(BOWL.radius / 2 - 0.25, 0.6, 'wasser', 0.5),
        ]),
        vorhang: centred([
          {
            from: [-0.2, BASIN_WATER + 0.4, -STREAM_HALF],
            to: [0.2, BOWL.rimTop - 1.5, STREAM_HALF],
            tex: 'flut',
            faces: ['east'],
          },
        ]),
      }
    : {};
  const vase: Record<string, Part> = m.vases ? { [`vase_${size}`]: centred(vaseBoxes(m)) } : {};
  return { ...parts, ...big, ...vase, krone: centred(crownBoxes()) };
}

/** Alle Modelle des Brunnens (Name → Modell-JSON, unter `models/item/brunnen/`). */
export function brunnenModels(): Record<string, Record<string, unknown>> {
  const all = { ...partsOf('gross'), ...partsOf('klein') };
  return Object.fromEntries(Object.entries(all).map(([name, part]) => [name, brunnenModelJson(part.boxes)]));
}

/** Für Tests: alle Kästen aller Modelle. */
export function brunnenBoxes(): Readonly<Record<string, readonly Box[]>> {
  const all = { ...partsOf('gross'), ...partsOf('klein') };
  return Object.fromEntries(Object.entries(all).map(([name, part]) => [name, part.boxes]));
}

export const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;
/**
 * Minecraft zeichnet Gegenstände in Anzeige-Objekten um 180° gedreht (lokal +x zeigt bei Blickrichtung 0° nach −x).
 * Im echten Client geprüft: ohne Ausgleich zeigten Schalenstücke und Vasenstrahlen nach außen.
 */
export const ITEM_DISPLAY_TURN = 180;

/** Anzeige-Objekt eines Teils: Mitte (x, y, z) in der Welt, Drehung um y (Grad), Größe. */
export interface BrunnenTeil {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: readonly [number, number, number];
}

/** Wo die Teile stehen (Welt-Koordinaten). (cx, cz) = Mitte des Brunnens, y0 = Höhe, auf der man daneben steht. */
export function brunnenTeile(size: BrunnenGroesse, cx: number, y0: number, cz: number): BrunnenTeil[] {
  const m = MEASURES[size];
  const parts = partsOf(size);
  const at = (
    name: string,
    radial: number,
    deg: number,
    scale: readonly [number, number, number] = [1, 1, 1],
  ): BrunnenTeil => {
    const a = (deg * Math.PI) / 180;
    const part = parts[name];
    return {
      name,
      x: r4(cx + (Math.cos(a) * radial) / BLOCK),
      y: r4(y0 + (part?.centre ?? 0) / BLOCK),
      z: r4(cz + (Math.sin(a) * radial) / BLOCK),
      yaw: r4((deg + ITEM_DISPLAY_TURN) % 360),
      scale,
    };
  };
  const rim = range(0, m.rimParts - 1).map((i) =>
    at(`rand_${size}_${i % 2 ? 'b' : 'a'}`, rimRc(m), (i * 360) / m.rimParts),
  );
  const bowl = m.bigBowl
    ? [
        ...range(0, BOWL_PARTS - 1).map((i) =>
          at(`schale_${i % 2 ? 'b' : 'a'}`, BOWL_RC, (i * 360) / BOWL_PARTS),
        ),
        ...range(0, STREAMS - 1).map((i) => at('vorhang', CURTAIN_R, ((i + 0.5) * 360) / STREAMS)),
        { ...at('schale_wasser', 0, 0, [2, 1, 2]), y: r4(y0 + (BOWL.floor + 0.3) / BLOCK) },
      ]
    : [];
  const vases = m.vases ? [45, 135, 225, 315].map((deg) => at(`vase_${size}`, rimRc(m) + 1, deg)) : [];
  // Krone größer aufstellen: sie sitzt mit ihrem Fuß im Wasser der oberen Schale
  const top = parts[`oben_${size}`];
  const upperWater = upperOf(m).water;
  const crown = parts['krone'];
  const crownBase = Math.min(...(crown?.boxes ?? []).map((b) => b.from[1]));
  const crownY = r4(y0 + (upperWater - 0.4 - crownBase * m.crownScale) / BLOCK);
  return [
    ...rim,
    at(`saeule_${size}`, 0, 0),
    ...bowl,
    { ...at(`oben_${size}`, 0, 0), y: r4(y0 + (top?.centre ?? 0) / BLOCK) },
    { ...at('krone', 0, 0, [m.crownScale, m.crownScale, m.crownScale]), y: crownY },
    ...vases,
  ];
}

/** Marker für das Lobby-Plugin: dort spritzt Wasser (Partikel), in der Mitte plätschert es (Klang). */
export const SPRITZER = 'mm_brunnen_spritzer';
export const MITTE = 'mm_brunnen_mitte';

/** Wo Wasser aufs Wasser trifft: [Abstand von der Mitte (px), Richtung (°), Höhe (px)]. */
function splashPoints(size: BrunnenGroesse): Array<readonly [number, number, number]> {
  const m = MEASURES[size];
  const upper = range(0, 7).map((k): readonly [number, number, number] => [
    19.75,
    k * 45,
    m.bigBowl ? BOWL.water + 0.3 : BASIN_WATER + 0.3,
  ]);
  const lower = m.bigBowl
    ? range(0, STREAMS - 1).map((i): readonly [number, number, number] => [
        CURTAIN_R,
        ((i + 0.5) * 360) / STREAMS,
        BASIN_WATER + 0.3,
      ])
    : [];
  const vases = m.vases
    ? [45, 135, 225, 315].map((deg): readonly [number, number, number] => [
        rimRc(m) + 1 - vaseReach(m),
        deg,
        BASIN_WATER + 0.3,
      ])
    : [];
  return [...upper, ...lower, ...vases];
}

/** Gegenstand eines Teils (über das leere Luft-Modell, siehe `brunnenItemCases`). */
export const itemOf = (name: string): string =>
  `{id:'minecraft:paper',count:1,components:{'minecraft:item_model':'minecraft:air','minecraft:custom_model_data':{strings:['brunnen','${name}']}}}`;

/** Licht der Teile: draußen wie der Himmel, nachts von den Scheinwerfern; drinnen wie unter dem Kronleuchter. */
const LIGHT: Readonly<Record<BrunnenGroesse, string>> = {
  gross: '{sky:15,block:12}',
  klein: '{sky:0,block:14}',
};

/**
 * Prunkbrunnen bauen: (x, z) = Block in der Mitte, y = Block unter dem Becken (Boden). Ohne Paket sieht man den
 * schlichten Ersatz aus Blöcken, mit Paket das Modell.
 */
export function prunkbrunnen(c: Canvas, x: number, y: number, z: number, size: BrunnenGroesse): void {
  const m = MEASURES[size];
  const pave = size === 'gross' ? 6.5 : m.rimBlocks;
  // Platz: Boden pflastern, darüber frei räumen
  disc(x, z, pave).forEach(([px, pz]) => {
    const d = Math.hypot(px - x, pz - z);
    c.set(px, y, pz, d <= m.rimBlocks ? 'smooth_quartz' : 'polished_diorite');
    range(y + 1, y + 3).forEach((py) => c.set(px, py, pz, 'air'));
  });
  disc(x, z, m.rimBlocks).forEach(([px, pz]) => {
    const d = Math.hypot(px - x, pz - z);
    const inside = d <= m.water;
    c.set(px, y + 1, pz, inside ? 'water' : BRUNNEN_ERSATZ.rand);
  });
  // Säule mit Fontäne (Ersatz)
  range(y + 1, y + 2).forEach((py) => c.set(x, py, z, BRUNNEN_ERSATZ.rand));
  c.set(x, y + 3, z, BRUNNEN_ERSATZ.fontaene);
  const tags = lobbyTags(['mm_deco', 'mm_brunnen']);
  splashPoints(size).forEach(([radial, deg, py]) => {
    const a = (deg * Math.PI) / 180;
    const sx = r4(x + 0.5 + (Math.cos(a) * radial) / BLOCK);
    const sz = r4(z + 0.5 + (Math.sin(a) * radial) / BLOCK);
    c.extra.push(`summon marker ${sx} ${r4(y + 1 + py / BLOCK)} ${sz} {Tags:[${lobbyTags([SPRITZER])}]}`);
  });
  c.extra.push(`summon marker ${x + 0.5} ${y + 2} ${z + 0.5} {Tags:[${lobbyTags([MITTE])}]}`);
  brunnenTeile(size, x + 0.5, y + 1, z + 0.5).forEach((t) => {
    const [sx, sy, sz] = t.scale;
    c.extra.push(
      `summon item_display ${t.x} ${t.y} ${t.z} {Tags:[${tags}],item:${itemOf(t.name)},item_display:'none',Rotation:[${t.yaw}f,0f],brightness:${LIGHT[size]},view_range:1.5f,transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],scale:[${sx}f,${sy}f,${sz}f]}}`,
    );
  });
}

/** Fälle für `items/air.json`: zweiter Text = Name des Teils; Wasser eingefärbt. */
export function brunnenItemCases(
  ns: string,
  names: readonly string[] = Object.keys(brunnenModels()),
): Record<string, unknown> {
  return {
    type: 'minecraft:select',
    property: 'minecraft:custom_model_data',
    index: 1,
    cases: names.map((name) => ({
      when: name,
      model: {
        type: 'minecraft:model',
        model: `${ns}:item/brunnen/${name}`,
        tints: [
          { type: 'minecraft:constant', value: WASSER_FARBE },
          { type: 'minecraft:constant', value: STRAHL_FARBE },
        ],
      },
    })),
    fallback: { type: 'minecraft:model', model: 'minecraft:item/air' },
  };
}
