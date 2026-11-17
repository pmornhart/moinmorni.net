/* eslint-disable ts-patterns/no-magic-numbers -- pixel art on the 64 × 32 armour layout */
/**
 * Weste, Regenjacke, Lederhose, Wathose und Gummistiefel aus Angelkönig als eigenes Muster am Körper: je Stück eine
 * Textur im Rüstungs-Raster von Minecraft (64 × 32, wie die Lederrüstung – Körper ab 16/16, Arm ab 40/16, Bein ab
 * 0/16, je Seite ein Rechteck). Minecraft legt sie als Ausrüstungs-Aussehen `moinmorni:kleidung/<stück>` über den
 * Spieler; Weste/Jacke/Stiefel in der Schicht `humanoid`, Hosen in `humanoid_leggings`. Was durchsichtig bleibt, zeigt
 * den Skin darunter (ärmellose Weste, kurze Lederhose).
 *
 * Dieselben Texturen tragen auch die kleinen 3D-Bilder im Inventar (`koerperModell`): ein Rumpf, Ärmel oder Beine als
 * Quader mit genau diesen Flächen.
 */
import { Picture } from '../png.js';
import {
  hash,
  mix,
  Modell,
  shade,
  type BuiltModel,
  type Dir,
  type Paint,
  type RenderBox,
  type Vec,
} from './modell.js';

export type BodyPart = 'body' | 'arm' | 'leg';
export type Side = 'front' | 'back' | 'outer' | 'inner' | 'top' | 'bottom';

/** Lage eines Teils im 64 × 32-Raster: Ursprung, Breite, Höhe, Tiefe (wie im Skin). */
const PARTS: Readonly<Record<BodyPart, readonly [number, number, number, number, number]>> = {
  body: [16, 16, 8, 12, 4],
  arm: [40, 16, 4, 12, 4],
  leg: [0, 16, 4, 12, 4],
};

/** Rechteck einer Seite: x, y, Breite, Höhe (Pixel). */
export function sideRect(part: BodyPart, side: Side): [number, number, number, number] {
  const [ox, oy, w, h, d] = PARTS[part];
  const rects: Readonly<Record<Side, [number, number, number, number]>> = {
    top: [ox + d, oy, w, d],
    bottom: [ox + d + w, oy, w, d],
    outer: [ox, oy + d, d, h],
    front: [ox + d, oy + d, w, h],
    inner: [ox + d + w, oy + d, d, h],
    back: [ox + d + w + d, oy + d, w, h],
  };
  return rects[side];
}

/** Malt jede Seite eines Teils: `fill(seite, u, v, breite, höhe)` → Farbe oder null (durchsichtig). */
type Fill = (side: Side, u: number, v: number, w: number, h: number) => number | null;

function paintPart(pic: Picture, part: BodyPart, fill: Fill): void {
  const SIDES: readonly Side[] = ['front', 'back', 'outer', 'inner', 'top', 'bottom'];
  SIDES.forEach((side) => {
    const [x, y, w, h] = sideRect(part, side);
    Array.from({ length: w * h }, (_, i) => {
      const u = i % w;
      const v = Math.floor(i / w);
      const c = fill(side, u, v, w, h);
      if (c !== null) pic.set(x + u, y + v, c);
    });
  });
}

/** Stoff mit leichtem Rauschen. */
const cloth =
  (base: number, seed: number, amount = 0.08) =>
  (u: number, v: number, side: Side): number =>
    shade(base, (hash(u, v, seed, side.length) - 0.5) * amount);

/** Umlaufende Zeile v eines Teils (vorn, hinten, außen, innen gleich hoch). */
const isWrap = (side: Side): boolean => side !== 'top' && side !== 'bottom';

export interface Garment {
  readonly id: string;
  /** Rüstungs-Schicht: `humanoid` (Oberkörper, Arme, Stiefel) oder `humanoid_leggings` (Hosen). */
  readonly layer: 'humanoid' | 'humanoid_leggings';
  readonly texture: Picture;
  /** Teile für das kleine 3D-Bild im Inventar. */
  readonly parts: readonly BodyPart[];
  /** Nur ein Teil der Höhe (Stiefel: unten). */
  readonly rows?: readonly [number, number];
}

// ---------- Anglerweste ----------

const KHAKI = 0x9a8656;
/** Reißverschluss: Kragenende, dann Zähne hell/dunkel im Wechsel. */
const ZIP = [0x5a4c2c, 0xc8c8c2, 0x8a8a84];

function anglerweste(): Garment {
  const pic = new Picture(64, 32);
  const base = cloth(KHAKI, 71);
  paintPart(pic, 'body', (side, u, v, w, h) => {
    if (side === 'bottom') return null;
    if (side === 'top') return u === 0 || u === w - 1 ? shade(KHAKI, -0.15) : base(u, v, side);
    if (side === 'front') {
      // Reißverschluss in der Mitte
      if (u === 3 || u === 4) return ZIP[v === 0 ? 0 : 1 + (v % 2)] ?? 0x8a8a84;
      // Kragen
      if (v === 0 && (u === 2 || u === 5)) return shade(KHAKI, -0.3);
      // Flicken mit Fliegen links oben (vom Träger aus rechts)
      if (u <= 2 && v >= 2 && v <= 4) {
        const flies: Record<string, number> = { '0,2': 0xc8352e, '2,3': 0x2f5fb0, '1,4': 0xf2d34a };
        return flies[`${u},${v}`] ?? 0xe6dfcc;
      }
      // kleine Brusttasche rechts oben mit Klappe
      if (u >= 5 && u <= 7 && v >= 2 && v <= 4) return v === 2 ? shade(KHAKI, -0.22) : base(u, v, side);
      // große Taschen unten, Klappe mit Druckknopf
      if (v >= 7 && v <= 10 && (u <= 2 || u >= 5)) {
        if (v === 7) return u === 1 || u === 6 ? 0x3a2f1a : shade(KHAKI, -0.25);
        return u === 0 || u === 7 || u === 2 || u === 5 ? shade(KHAKI, -0.12) : shade(KHAKI, 0.06);
      }
      // D-Ring
      if (u === 6 && v === 5) return 0xb0b4b8;
      if (v === h - 1) return shade(KHAKI, -0.2);
      return base(u, v, side);
    }
    if (side === 'back') {
      // Netzeinsatz oben, großer Rückenbeutel, Ring für den Kescher
      if (v <= 3) return (u + v) % 2 === 0 ? shade(KHAKI, -0.35) : shade(KHAKI, 0.05);
      if (v === 4 && (u === 3 || u === 4)) return 0xb0b4b8;
      if (v >= 6 && v <= 10 && u >= 1 && u <= 6) return v === 6 ? shade(KHAKI, -0.22) : shade(KHAKI, 0.04);
      if (v === h - 1) return shade(KHAKI, -0.2);
      return base(u, v, side);
    }
    // Seiten: Riemen mit Schnalle
    if (v === 8) return u === 1 ? 0xb0b4b8 : 0x4a3c22;
    return v === h - 1 ? shade(KHAKI, -0.2) : base(u, v, side);
  });
  return { id: 'anglerweste', layer: 'humanoid', texture: pic, parts: ['body'] };
}

// ---------- Regenjacke ----------

const YELLOW = 0xf2c12e;

function regenjacke(): Garment {
  const pic = new Picture(64, 32);
  const base = cloth(YELLOW, 81, 0.06);
  const stripe = 0xdfe3e6;
  paintPart(pic, 'body', (side, u, v, w, h) => {
    if (side === 'bottom') return null;
    if (side === 'top') return base(u, v, side);
    if (v === 9) return (u + v) % 2 === 0 ? stripe : shade(stripe, -0.1);
    if (side === 'front') {
      if (v === 0) return shade(YELLOW, -0.25);
      // Leiste mit Knebelknöpfen
      if (u === 3 || u === 4) return [2, 5, 7].includes(v) && u === 4 ? 0x7a4a22 : shade(YELLOW, -0.12);
      // Taschen mit Klappe
      if (v === 6 && (u <= 2 || u >= 5)) return shade(YELLOW, -0.22);
      if (v === h - 1) return shade(YELLOW, -0.2);
      return base(u, v, side);
    }
    if (side === 'back') {
      // Kapuze hängt im Rücken
      const hood = v <= 4 && u >= 1 && u <= 6;
      if (hood && (v === 4 || u === 1 || u === 6)) return shade(YELLOW, -0.3);
      if (hood) return shade(YELLOW, -0.08);
      return v === h - 1 ? shade(YELLOW, -0.2) : base(u, v, side);
    }
    return v === h - 1 ? shade(YELLOW, -0.2) : base(u, v, side);
  });
  paintPart(pic, 'arm', (side, u, v, _w, h) => {
    if (side === 'bottom') return null;
    if (side === 'top') return base(u, v, side);
    if (v === 7) return (u + v) % 2 === 0 ? stripe : shade(stripe, -0.1);
    if (v >= h - 2) return shade(YELLOW, -0.25);
    return base(u, v, side);
  });
  return { id: 'regenjacke', layer: 'humanoid', texture: pic, parts: ['body', 'arm'] };
}

// ---------- Lederhose ----------

const LEATHER = 0x6e4a2a;
const GREEN_STITCH = 0x4f8a3a;

function lederhose(): Garment {
  const pic = new Picture(64, 32);
  const leather = (u: number, v: number, side: Side): number =>
    shade(LEATHER, (hash(u, v, 91, side.length) - 0.5) * 0.14 + (hash(u >> 1, v >> 1, 92) - 0.5) * 0.08);
  const strap = 0x3f2a16;
  paintPart(pic, 'body', (side, u, v, w, h) => {
    if (side === 'top' || side === 'bottom') return null;
    const waist = v >= 8;
    if (side === 'front') {
      // Hosenträger mit besticktem Steg (Edelweiß)
      if (v <= 7 && (u === 1 || u === 6)) return v === 7 ? 0xc8c0a0 : strap;
      if ((v === 3 || v === 4) && u >= 2 && u <= 5) {
        if (u === 3 || u === 4) return v === 3 ? 0xf6f4ec : 0xf2d13a;
        return v === 3 ? GREEN_STITCH : strap;
      }
      if (!waist) return null;
      // Latz mit Stickerei, grüne Naht
      if (v === 8) return GREEN_STITCH;
      if (u >= 2 && u <= 5 && v >= 9 && v <= 10)
        return (u === 3 || u === 4) && v === 9 ? 0xf6f4ec : leather(u, v, side);
      if (u === 1 || u === 6) return v === 9 ? 0xc8c0a0 : leather(u, v, side);
      return leather(u, v, side);
    }
    if (side === 'back') {
      // Träger hinten über Kreuz
      if (v <= 7 && (u === v || u === w - 1 - v)) return strap;
      if (v <= 7) return null;
      return v === 8 ? GREEN_STITCH : leather(u, v, side);
    }
    if (!waist) return null;
    return v === 8 ? GREEN_STITCH : leather(u, v, side);
  });
  paintPart(pic, 'leg', (side, u, v, _w, _h) => {
    if (side === 'top') return null;
    if (side === 'bottom') return null;
    if (v > 6) return null;
    // Knieband mit Schnürung, grüne Naht außen
    if (v === 6) return u % 2 === 0 ? 0x2a1a0c : shade(LEATHER, -0.2);
    if (side === 'outer' && u === 1) return GREEN_STITCH;
    if (side === 'front' && v === 2 && u === 2) return 0xf6f4ec;
    return leather(u, v, side);
  });
  return { id: 'lederhose', layer: 'humanoid_leggings', texture: pic, parts: ['body', 'leg'] };
}

// ---------- Wathose ----------

const WADER = 0x3d4a2f;

function wathose(): Garment {
  const pic = new Picture(64, 32);
  const base = cloth(WADER, 101, 0.1);
  const boot = 0x1f241b;
  paintPart(pic, 'body', (side, u, v, w, h) => {
    if (side === 'top' || side === 'bottom') return null;
    if (side === 'front') {
      // Träger, dann Latz bis zur Brust, Schnallen, Brusttasche, Gürtel
      if (v <= 1) return u === 1 || u === 6 ? 0x2a2a22 : null;
      if (v === 2 && (u === 1 || u === 6)) return 0xc0c4c8;
      if (v >= 2 && (u === 0 || u === 7) && v < 6) return null;
      if (v >= 3 && v <= 5 && u >= 2 && u <= 5) return v === 3 ? shade(WADER, -0.25) : shade(WADER, 0.05);
      if (v === 8) return u === 3 || u === 4 ? 0xb8a060 : 0x24281c;
      return base(u, v, side);
    }
    if (side === 'back') {
      if (v <= 5) return u === v + 1 || u === w - 2 - v ? 0x2a2a22 : null;
      return v === 8 ? 0x24281c : base(u, v, side);
    }
    if (v < 6) return null;
    return v === 8 ? 0x24281c : base(u, v, side);
  });
  paintPart(pic, 'leg', (side, u, v, _w, h) => {
    if (side === 'top') return null;
    if (side === 'bottom') return (u + v) % 2 === 0 ? 0x111410 : 0x2a2e26;
    if (v >= 8) return v === h - 1 ? 0x111410 : shade(boot, (hash(u, v, 103) - 0.5) * 0.12);
    if (v >= 4 && v <= 5 && side === 'front') return shade(WADER, -0.18);
    return base(u, v, side);
  });
  return { id: 'wathose', layer: 'humanoid_leggings', texture: pic, parts: ['body', 'leg'] };
}

// ---------- Gummistiefel ----------

const RUBBER = 0x2f4a2f;

function gummistiefel(): Garment {
  const pic = new Picture(64, 32);
  paintPart(pic, 'leg', (side, u, v, w, h) => {
    if (side === 'top') return null;
    if (side === 'bottom') return (u + v) % 2 === 0 ? 0x1a1a18 : 0x3a3a36;
    if (v < 6) return null;
    if (v === 6) return 0xe8c23a;
    if (v === h - 1) return side === 'front' && u >= 1 && u <= 2 ? 0x5a5a52 : 0x262622;
    const mud = hash(u, v, side.length, 111) > 0.82 && v >= 9;
    if (mud) return mix(0x6a4a2a, 0x4a3420, hash(u, v, 112));
    const shine = side === 'front' && u === 1 && v <= 9 ? 0.18 : 0;
    return shade(RUBBER, (hash(u, v, 113) - 0.5) * 0.08 + shine - (u === w - 1 ? 0.08 : 0));
  });
  return { id: 'gummistiefel', layer: 'humanoid', texture: pic, parts: ['leg'], rows: [6, 12] };
}

export const GARMENT_BUILDERS: Readonly<Record<string, () => Garment>> = {
  anglerweste,
  regenjacke,
  lederhose,
  wathose,
  gummistiefel,
};

const cacheG = new Map<string, Garment>();
export function garment(id: string): Garment {
  const hit = cacheG.get(id);
  if (hit) return hit;
  const build = GARMENT_BUILDERS[id];
  if (!build) throw new Error(`Kein Kleidungsstück ${id}`);
  const g = build();
  cacheG.set(id, g);
  return g;
}

// ---------- Körper aus Quadern (Inventar-Bild und Vorschau) ----------

/** Welche Seite einer Skin-Box auf welche Fläche im Modell kommt (Figur schaut nach Norden). */
const FACE_OF: Readonly<Record<Dir, Side>> = {
  north: 'front',
  south: 'back',
  east: 'outer',
  west: 'inner',
  up: 'top',
  down: 'bottom',
};

/** Teile des Körpers als Quader mit den Flächen aus der Textur; Lage in Skin-Pixeln, Füße bei y 0. */
export interface SkinBox {
  readonly part: BodyPart;
  readonly from: Vec;
  readonly to: Vec;
  /** gespiegelt (linker Arm/linkes Bein): außen/innen tauschen */
  readonly mirror: boolean;
}

/** Figur in Skin-Pixeln: Mitte x 0, Füße bei y 0, vorn −z. Rüstung wird um `grow` aufgeblasen. */
export function figureBoxes(parts: readonly BodyPart[], grow: number): SkinBox[] {
  const g = grow;
  const all: SkinBox[] = [
    { part: 'body', from: [-4 - g, 12 - g, -2 - g], to: [4 + g, 24 + g, 2 + g], mirror: false },
    { part: 'arm', from: [4 - g, 12 - g, -2 - g], to: [8 + g, 24 + g, 2 + g], mirror: false },
    { part: 'arm', from: [-8 - g, 12 - g, -2 - g], to: [-4 + g, 24 + g, 2 + g], mirror: true },
    { part: 'leg', from: [0 - g, 0 - g, -2 - g], to: [4 + g, 12 + g, 2 + g], mirror: false },
    { part: 'leg', from: [-4 - g, 0 - g, -2 - g], to: [0 + g, 12 + g, 2 + g], mirror: true },
  ];
  return all.filter((b) => parts.includes(b.part));
}

/** Seite einer Box → Fläche (mit Spiegelung für links). */
function sideFor(dir: Dir, mirror: boolean): Side {
  if (mirror && dir === 'east') return 'inner';
  if (mirror && dir === 'west') return 'outer';
  return FACE_OF[dir];
}

/**
 * Skin-Boxen als Vorschau-Quader (Flächen direkt aus der 64 × 32-Textur). `rows` schneidet in der Höhe zu (Zeilen
 * von oben, z. B. Stiefel 6 … 12).
 */
export function skinRenderBoxes(
  texture: Picture,
  boxes: readonly SkinBox[],
  rows?: readonly [number, number],
): RenderBox[] {
  return boxes.map((b) => {
    const h = b.to[1] - b.from[1];
    const [r0, r1] = rows ?? [0, 12];
    const top = b.to[1] - (h * r0) / 12;
    const bottom = b.to[1] - (h * r1) / 12;
    const faces = Object.fromEntries(
      (['north', 'south', 'east', 'west', 'up', 'down'] as const).map((dir) => {
        const [x, y, w, hh] = sideRect(b.part, sideFor(dir, b.mirror));
        const wrap = isWrap(sideFor(dir, b.mirror));
        const rect: [number, number, number, number] = wrap ? [x, y + r0, w, r1 - r0] : [x, y, w, hh];
        return [dir, { picture: texture, rect }];
      }),
    );
    return { from: [b.from[0], bottom, b.from[2]], to: [b.to[0], top, b.to[2]], faces };
  });
}

/**
 * Kleines 3D-Modell fürs Inventar: die Teile des Stücks als Quader mit genau den Flächen der Körper-Textur
 * (`moinmorni:item/kleidung/<stück>_koerper`). Größe: passt in ein Feld (16 × 16).
 */
export function koerperModell(g: Garment): BuiltModel {
  const boxes = skinRenderBoxes(g.texture, figureBoxes(g.parts, 0.25), g.rows);
  const ys = boxes.flatMap((b) => [b.from[1], b.to[1]]);
  const xs = boxes.flatMap((b) => [b.from[0], b.to[0]]);
  const span = Math.max(Math.max(...ys) - Math.min(...ys), Math.max(...xs) - Math.min(...xs));
  const s = 14 / span;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const at = (p: Vec): Vec => [8 - p[0] * s, 8 + (p[1] - cy) * s, 8 + p[2] * s];
  const ref = `moinmorni:item/kleidung/${g.id}_koerper`;
  const UV = 16;
  const elements = boxes.map((b) => {
    const a = at(b.from);
    const c = at(b.to);
    const from = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.min(a[2], c[2])].map(round);
    const to = [Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.max(a[2], c[2])].map(round);
    // x ist gespiegelt (Modell schaut nach Norden, Blick von vorn): Ost und West tauschen
    const SWAP: Partial<Record<Dir, Dir>> = { east: 'west', west: 'east' };
    const faces = Object.fromEntries(
      Object.entries(b.faces).map(([dir, f]) => {
        const [x, y, w, h] = f!.rect;
        return [
          SWAP[dir as Dir] ?? dir,
          {
            uv: [(x * UV) / 64, (y * UV) / 32, ((x + w) * UV) / 64, ((y + h) * UV) / 32].map(round),
            texture: '#t',
          },
        ];
      }),
    );
    return { from, to, faces };
  });
  return {
    json: { textures: { t: ref, particle: ref }, elements, display: BODY_DISPLAY },
    texture: g.texture,
    frames: 1,
    boxes,
  };
}

const round = (n: number): number => Math.round(n * 10000) / 10000;

const BODY_DISPLAY = {
  gui: { rotation: [15, 160, 0], translation: [0, 0, 0], scale: [0.95, 0.95, 0.95] },
  ground: { rotation: [0, 0, 0], translation: [0, 2, 0], scale: [0.4, 0.4, 0.4] },
  fixed: { rotation: [0, 180, 0], translation: [0, 0, 0], scale: [0.8, 0.8, 0.8] },
  head: { rotation: [0, 180, 0], translation: [0, 13, 7], scale: [1, 1, 1] },
  thirdperson_righthand: { rotation: [0, 180, 0], translation: [0, 2, 1], scale: [0.45, 0.45, 0.45] },
  thirdperson_lefthand: { rotation: [0, 180, 0], translation: [0, 2, 1], scale: [0.45, 0.45, 0.45] },
  firstperson_righthand: { rotation: [0, 135, 0], translation: [0, 1, 0], scale: [0.45, 0.45, 0.45] },
  firstperson_lefthand: { rotation: [0, 135, 0], translation: [0, 1, 0], scale: [0.45, 0.45, 0.45] },
};

export type { Paint };
