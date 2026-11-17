/* eslint-disable ts-patterns/no-magic-numbers -- a decoration plan: positions, sizes and colours as the lobby needs them */
/**
 * Weihnachtsmarkt – im Winter werden der Dorfmarkt um den Christbaum und der Schlossmarkt zum Weihnachtsmarkt:
 *
 * - **Buden:** Tannengirlande mit Lichtern vorne und an den Seiten der Markise, Eiszapfen an der Kante, Schnee auf dem
 *   Dach (macht `winter.ts`), warmes Licht unter der Markise. Figuren und Stände bleiben, wie sie sind.
 * - **Lichterketten** im Ring von Bude zu Bude (über alle Gassen), am Schlossmarkt von Stand zu Stand und zum
 *   Marktbogen, der Girlande, Lichter und einen Stern bekommt.
 * - **Glühwein- und Lebkuchenbude** am Eingang von der Ankunft her (nur Deko), dazwischen das Weihnachtstor (`weihnachtstor.ts`).
 * - **Krippe** auf der Wiese westlich vom Platz: offener Stall mit Heu, Maria, Josef, dem Kind in der Krippe, Ochs,
 *   Esel und Schafen, Stern über dem Dach.
 * Blöcke (Buden, Stall, Licht) setzt der Winter wie den Schnee – jede andere Saison stellt die Stellen genau wieder her.
 */
import { Canvas } from '../canvas.js';
import { Frame } from '../frame.js';
import { GROUND } from '../nature.js';
import { pairs, range } from '../range.js';
import { gableRoof, STEP, type Facing } from '../shapes.js';
import { MARKET } from './dorfplatz.js';
import { MARKET_ARCH_Z, SCHLOSSMARKT } from './schlossmarkt.js';
import { SPORT_HOST } from './sportstand.js';
import {
  aroundX,
  aroundY,
  blockDisplay,
  itemDisplay,
  placeModel,
  textSign,
  type ModelPart,
  type Vec,
} from './deko.js';
import type { World } from '../pruefung.js';
import { settle, settleDown } from './halt.js';
import { esel, josef, krippeMitKind, maria, ochse, schaf, stern } from './winter-figuren.js';
import { clearPlants, HALF, tags, type View } from './winter-base.js';
import { weihnachtstor } from './weihnachtstor.js';

// ---------- Stände ----------

export interface Stall {
  readonly x: number;
  readonly z: number;
  readonly front: Facing;
  /** Steht im Ring um den Christbaum (Dorfmarkt) – sonst am Schlossmarkt. */
  readonly ring: boolean;
}

/**
 * Alle Stände: Dorfmarkt um den Maibaum bzw. Christbaum und Schlossmarkt (Mitte der Vorderkante, Blickrichtung). Der
 * Sport-Stand (Skihütte bzw. Bootshaus, `sportstand.ts`) bringt seinen eigenen Schmuck mit und fehlt hier.
 */
export const STALLS: readonly Stall[] = [
  ...MARKET.map(([x, z, front]) => ({ x, z, front, ring: true })),
  ...SCHLOSSMARKT.filter((s) => s.mode !== SPORT_HOST).map((s) => ({
    x: s.x,
    z: s.z,
    front: 'south' as Facing,
    ring: false,
  })),
];
/** Abstand zweier benachbarter Stände am Schlossmarkt (dazwischen hängt eine Kette, über eine Lücke nicht). */
const NEIGHBOUR_GAP = 8;

const SCRATCH = new Canvas();
/** Bau-Rahmen eines Stands wie in `stallAt` (common.ts): Ursprung drei Blöcke links der Mitte. */
export function stallFrame(s: Stall, c: Canvas = SCRATCH): Frame {
  const [rx, rz] = STEP[new Frame(SCRATCH, 0, 0, 0, s.front).right];
  return new Frame(c, s.x - rx * 3, GROUND, s.z - rz * 3, s.front);
}

/** Punkt in Rahmen-Koordinaten (u nach rechts, v nach hinten; Zelle k reicht von k bis k+1) in der Welt. */
export function pointAt(f: Frame, u: number, y: number, v: number): Vec {
  const [rx, rz] = STEP[f.right];
  const [bx, bz] = STEP[f.back];
  return [
    f.ox + HALF + (u - HALF) * rx + (v - HALF) * bx,
    f.oy + y,
    f.oz + HALF + (u - HALF) * rz + (v - HALF) * bz,
  ];
}

/** Drehung eines Modells, dessen Vorderseite (+z) in Richtung `front` zeigt. */
export const yawOf = (front: Facing): number => Math.atan2(STEP[front][0], STEP[front][1]);
/** Blickrichtung einer Text-Anzeige in Grad (0 = Süden). */
const signYaw = (front: Facing): number => (-yawOf(front) * 180) / Math.PI;

const GREEN = { block: 'spruce_leaves', properties: { persistent: 'true' } } as const;
const STALL_LIGHTS: readonly string[] = ['glowstone', 'red_concrete', 'ochre_froglight', 'red_concrete'];

/**
 * Modell in Rahmen-Koordinaten: Teile mit `at` = [u, y, −v] (also wie `placeModel`: x nach rechts, z nach vorne),
 * Ursprung vorne links unten des Rahmens.
 */
function inFrame(f: Frame, kind: string, parts: readonly ModelPart[]): string[] {
  return placeModel(tags(kind), pointAt(f, 0, 0, 0), yawOf(f.front), parts);
}

/** Tannengirlande mit Lichtern entlang einer Kante (in Rahmen-Koordinaten von a nach b, gerade). */
function garland(a: Vec, b: Vec, thick: number, lights: readonly string[]): ModelPart[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const alongX = Math.abs(b[0] - a[0]) >= Math.abs(b[2] - a[2]);
  const green: ModelPart = {
    at: mid,
    ...GREEN,
    scale: alongX ? [length, thick, thick] : [thick, thick, length],
  };
  const count = Math.max(2, Math.floor(length / 0.9));
  const bulbs = range(0, count - 1).map((k): ModelPart => {
    const t = (k + HALF) / count;
    return {
      at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - thick * 0.3, a[2] + (b[2] - a[2]) * t] as Vec,
      block: lights[k % lights.length] ?? 'glowstone',
      scale: [0.15, 0.15, 0.15],
      glow: true,
    };
  });
  return [green, ...bulbs];
}

/** Eiszapfen unter einer Kante (Rahmen-Koordinaten): unregelmäßig, verschieden lang. */
function eiszapfen(u1: number, u2: number, y: number, z: number, seed: number): ModelPart[] {
  return range(0, Math.floor(u2 - u1) - 1)
    .filter((k) => (k * 7 + seed) % 3 !== 0)
    .map((k): ModelPart => {
      const length = 0.22 + (((k * 5 + seed) % 4) / 4) * 0.3;
      return {
        at: [u1 + k + 0.5 + (((k + seed) % 3) - 1) * 0.15, y - length / 2, z],
        block: 'ice',
        scale: [0.08, length, 0.08],
        rotation: aroundY(Math.PI / 4),
      };
    });
}

/** Weihnachtliche Bude: Girlande vorne und an den Seiten der Markise, Lichter, Eiszapfen an der Kante. */
function stallDeco(s: Stall, i: number): string[] {
  const f = stallFrame(s);
  return inFrame(f, 'stand', [
    ...garland([0, 4.96, 1.08], [7, 4.96, 1.08], 0.32, STALL_LIGHTS),
    ...garland([-0.06, 5.92, 0], [-0.06, 5.92, -4], 0.26, STALL_LIGHTS),
    ...garland([7.06, 5.92, 0], [7.06, 5.92, -4], 0.26, STALL_LIGHTS),
    ...eiszapfen(0, 7, 4, 0.9, i),
  ]);
}

/** Warmes Licht unter der Markise (unsichtbarer Lichtblock vor der Theke). */
function stallLight(w: Canvas, s: Stall): void {
  stallFrame(s, w).set(3, 3, -1, 'light[level=13]');
}

/** Vordere Ecken der Markise (links, rechts) – dort hängen die Lichterketten. */
export function stallCorners(s: Stall): readonly [Vec, Vec] {
  const f = stallFrame(s);
  return [pointAt(f, 0, 4.55, -1.05), pointAt(f, 7, 4.55, -1.05)];
}

/** Kürzer lohnt keine Kette (Stände, die sich an einer Ecke berühren). */
const MIN_CHAIN = 2;
const CHAIN_LIGHTS: readonly string[] = [
  'glowstone',
  'ochre_froglight',
  'red_concrete',
  'glowstone',
  'lime_concrete',
];

/** Lichterkette von a nach b mit Durchhang (Lichter leuchten, ohne Hitbox). */
export function lightChain(kind: string, a: Vec, b: Vec, sag: number, colours: readonly string[]): string[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const count = Math.max(2, Math.floor(length / 0.9));
  return range(0, count).map((i) => {
    const t = i / count;
    const at: Vec = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t),
      a[2] + (b[2] - a[2]) * t,
    ];
    return blockDisplay(tags(kind), at, colours[i % colours.length] ?? 'glowstone', {
      scale: [0.16, 0.16, 0.16],
      glow: true,
    });
  });
}

/** Ring aus Lichterketten um den Christbaum: von jeder Bude zur nächsten (über die Gassen hinweg). */
function ringKetten(): string[] {
  const ring = STALLS.filter((s) => s.ring);
  const corners = ring.flatMap((s, i) => stallCorners(s).map((p) => ({ p, stall: i })));
  const angle = (p: Vec): number => Math.atan2(p[2] - HALF, p[0] - HALF);
  const sorted = [...corners].sort((a, b) => angle(a.p) - angle(b.p));
  return sorted.flatMap((c, k) => {
    const next = sorted[(k + 1) % sorted.length];
    if (!next || next.stall === c.stall) return [];
    const gap = Math.hypot(next.p[0] - c.p[0], next.p[2] - c.p[2]);
    // Stände, die an einer Ecke aneinanderstoßen, brauchen keine Kette
    if (gap < MIN_CHAIN) return [];
    return lightChain('kette', c.p, next.p, Math.min(1.1, 0.25 + gap * 0.08), CHAIN_LIGHTS);
  });
}

/** Schlossmarkt: Ketten von Stand zu Stand auf jeder Seite und vom Marktbogen zum ersten Stand. */
function schlossmarktKetten(): string[] {
  const row = STALLS.filter((s) => !s.ring);
  const side = (sign: number): Stall[] =>
    row.filter((s) => Math.sign(s.x) === sign).sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
  return [-1, 1].flatMap((sign) => {
    const stalls = side(sign);
    // Ecke, die zur Prachtstraße zeigt (innen) bzw. nach außen
    const inner = (s: Stall): Vec =>
      stallCorners(s).reduce((p, q) => (Math.abs(q[0]) < Math.abs(p[0]) ? q : p));
    const outer = (s: Stall): Vec =>
      stallCorners(s).reduce((p, q) => (Math.abs(q[0]) > Math.abs(p[0]) ? q : p));
    const arch: Vec = [sign > 0 ? 7.5 : -6.5, GROUND + 6.6, MARKET_ARCH_Z + HALF];
    const first = stalls[0];
    return [
      ...(first ? lightChain('kette', arch, inner(first), 0.9, CHAIN_LIGHTS) : []),
      ...stalls.slice(1).flatMap((s, i) => {
        const prev = stalls[i];
        if (!prev || Math.abs(Math.abs(s.x) - Math.abs(prev.x)) > NEIGHBOUR_GAP) return [];
        // Seit acht Ständen (17.11.) stoßen die Markisen fast aneinander – dort hängt keine Kette.
        const [a, b] = [outer(prev), inner(s)];
        if (Math.hypot(b[0] - a[0], b[2] - a[2]) < MIN_CHAIN) return [];
        return lightChain('kette', a, b, 0.35, CHAIN_LIGHTS);
      }),
    ];
  });
}

/** Marktbogen des Schlossmarkts: Girlande mit Lichtern vorne und hinten am Balken, Stern obendrauf. */
function marktbogen(world: World): string[] {
  const top = GROUND + 7;
  const z = MARKET_ARCH_Z;
  const parts: ModelPart[] = [
    ...garland([-7, top + 0.9, z + 1.12], [8, top + 0.9, z + 1.12], 0.34, STALL_LIGHTS),
    ...garland([-7, top + 0.9, z - 0.12], [8, top + 0.9, z - 0.12], 0.34, STALL_LIGHTS),
  ];
  // Stern: von oben herab, bis er auf dem Bogen steht
  const star = (at: Vec): string[] => placeModel(tags('bogen'), at, 0, stern(1.5));
  const above: Vec = [HALF, top + 2.3, z + HALF];
  return [
    ...placeModel(tags('bogen'), [0, 0, 0], 0, parts),
    ...(settleDown(world, above, star, above[1] + 1, top) ?? star(above)),
  ];
}

// ---------- Glühwein- und Lebkuchenbude ----------

interface Bude {
  /** Vorne links unten (wie `Frame`). */
  readonly x: number;
  readonly z: number;
  readonly front: Facing;
  readonly kind: 'gluehwein' | 'lebkuchen';
}

/** Die beiden Buden am Eingang von der Ankunft her, Theke zum Weg. */
export const BUDEN: readonly Bude[] = [
  { x: -11, z: 24, front: 'east', kind: 'gluehwein' },
  { x: 11, z: 20, front: 'west', kind: 'lebkuchen' },
];
const BUDE_WIDTH = 5;
const BUDE_DEPTH = 3;
const BUDE_POSTS = 5;

/** Felder (x, z), die eine Bude belegt – samt Dachüberstand oder nur, wo sie auf dem Boden steht. */
export function budeArea(b: Bude, overhang = true): Array<[number, number]> {
  const f = new Frame(SCRATCH, b.x, GROUND, b.z, b.front);
  const o = overhang ? 1 : 0;
  return pairs(range(-o, BUDE_WIDTH - 1 + o), range(-o, BUDE_DEPTH - 1 + o)).map(([u, v]) => {
    const [x, , z] = f.at(u, 0, v);
    return [x, z];
  });
}

function bude(w: Canvas, v: View, b: Bude): string[] {
  const f = new Frame(w, b.x, GROUND, b.z, b.front);
  const right = BUDE_WIDTH - 1;
  const back = BUDE_DEPTH - 1;
  pairs(range(-1, BUDE_WIDTH), range(-1, BUDE_DEPTH)).forEach(([u, dv]) => {
    const [x, , z] = f.at(u, 0, dv);
    clearPlants(w, v, x, z);
  });
  f.fill(0, 0, 0, right, 0, back, 'spruce_planks');
  pairs([0, right], [0, back]).forEach(([u, dv]) =>
    f.fill(u, 1, dv, u, BUDE_POSTS, dv, 'stripped_spruce_log[axis=y]'),
  );
  f.fill(1, 1, back, right - 1, BUDE_POSTS, back, 'spruce_planks');
  [0, right].forEach((u) => f.fill(u, 1, 1, u, BUDE_POSTS, 1, 'spruce_planks'));
  f.fill(1, 1, 0, right - 1, 1, 0, `barrel[facing=${f.dir('front')}]`);
  f.fill(1, 2, 0, right - 1, 2, 0, 'spruce_slab[type=top]');
  f.fill(1, BUDE_POSTS, 0, right - 1, BUDE_POSTS, 0, 'spruce_planks');
  const [x1, , z1] = f.at(0, 0, 0);
  const [x2, , z2] = f.at(right, 0, back);
  gableRoof(w, {
    x1: Math.min(x1, x2),
    x2: Math.max(x1, x2),
    z1: Math.min(z1, z2),
    z2: Math.max(z1, z2),
    y: GROUND + BUDE_POSTS + 1,
    along: f.frontAxis() === 'x' ? 'x' : 'z',
    material: 'spruce',
    gable: 'spruce_planks',
  });
  if (b.kind === 'gluehwein') {
    // Kessel auf dem Feuer, Fässer, Krüge auf der Theke (mit Lobby-Paket Steinkrüge)
    f.set(1, 1, 1, 'barrel[facing=up]');
    f.set(2, 1, 1, 'campfire[lit=true,signal_fire=false]');
    f.set(2, 2, 1, 'cauldron');
    f.set(3, 1, 1, 'barrel[facing=up]');
    f.set(3, 2, 1, 'barrel[facing=up]');
    f.set(1, 3, 0, 'brown_candle[candles=3,lit=false]');
    f.set(2, 3, 0, 'brown_candle[candles=2,lit=false]');
    f.set(3, 3, 0, 'brown_candle[candles=4,lit=false]');
  } else {
    f.set(1, 1, 1, 'barrel[facing=up]');
    f.set(2, 1, 1, 'barrel[facing=up]');
    f.set(3, 1, 1, 'barrel[facing=up]');
    f.set(1, 2, 1, 'lantern');
    f.set(2, 3, 0, 'cake');
    f.set(2, 4, 1, 'light[level=14]');
  }
  return budeDeko(f, b);
}

function budeDeko(f: Frame, b: Bude): string[] {
  const right = BUDE_WIDTH;
  const name =
    b.kind === 'gluehwein'
      ? [
          { text: 'Glühwein\\n', color: 'gold', bold: true },
          { text: 'Mulled wine', color: 'white' },
        ]
      : [
          { text: 'Lebkuchen\\n', color: 'gold', bold: true },
          { text: 'Gingerbread', color: 'white' },
        ];
  const sign = textSign(
    tags('bude'),
    pointAt(f, right / 2, BUDE_POSTS + 0.18, -0.04),
    signYaw(f.front),
    name,
    0.62,
  );
  const deko = inFrame(f, 'bude', [
    ...garland([-1, BUDE_POSTS + 1.12, 1.12], [right + 1, BUDE_POSTS + 1.12, 1.12], 0.3, STALL_LIGHTS),
    ...eiszapfen(-1, right + 1, BUDE_POSTS + 1, 0.92, b.kind.length),
  ]);
  const goods =
    b.kind === 'lebkuchen'
      ? [1.5, 3.5].flatMap((u) =>
          [-0.18, 0.18].map((d) =>
            itemDisplay(
              tags('bude'),
              pointAt(f, u + d, 3.04, 0.5 + d),
              'cookie',
              0.32,
              aroundX(-Math.PI / 2),
            ),
          ),
        )
      : [];
  const hearts =
    b.kind === 'lebkuchen'
      ? [1.5, 2.5, 3.5].flatMap((u, i) => [
          textSign(
            tags('bude'),
            pointAt(f, u, 1.0, -0.06),
            signYaw(f.front),
            [{ text: '❤', color: '#9a5a2e' }],
            2.2,
          ),
          textSign(
            tags('bude'),
            pointAt(f, u, 1.42, -0.08),
            signYaw(f.front),
            [{ text: ['Servus', 'Frohe', 'Fest'][i] ?? '', color: 'white', bold: true }],
            0.32,
          ),
        ])
      : [];
  return [sign, ...deko, ...goods, ...hearts];
}

/** Eingangsbogen von der Ankunft her: zwei Pfosten und ein Balken quer über den Platz. */
export const EINGANG = { x1: -6, x2: 7, z: 19, height: 5 } as const;

/**
 * Eingangsbogen (Blöcke in `w`): das Weihnachtstor (`weihnachtstor.ts`) mit dicker Girlande, Bögen, Schild oben auf
 * dem Balken – dazu die Lichterkette unter dem Balken zum Platz hin.
 */
function eingang(w: Canvas): string[] {
  const { x1, x2, z, height } = EINGANG;
  const beam = GROUND + height;
  const chains = lightChain(
    'eingang',
    [x1 + 1.05, beam - 0.12, z - 0.08],
    [x2 - 0.05, beam - 0.12, z - 0.08],
    0.55,
    CHAIN_LIGHTS,
  );
  return [...weihnachtstor(w, EINGANG), ...chains];
}

// ---------- Krippe ----------

/** Stall der Krippe: vorne links unten, offene Seite nach Osten (zum Dorfplatz). */
export const KRIPPE = { x: -31, z: -8, front: 'east' as Facing, width: 7, depth: 5 } as const;

/** Felder (x, z), die der Stall belegt – samt Dachüberstand und Schafen davor oder nur seine Grundfläche. */
export function krippeArea(around = true): Array<[number, number]> {
  const f = new Frame(SCRATCH, KRIPPE.x, GROUND, KRIPPE.z, KRIPPE.front);
  const us = around ? range(-1, KRIPPE.width) : range(0, KRIPPE.width - 1);
  const vs = around ? range(-3, KRIPPE.depth) : range(0, KRIPPE.depth - 1);
  return pairs(us, vs).map(([u, v]) => {
    const [x, , z] = f.at(u, 0, v);
    return [x, z];
  });
}

function krippe(w: Canvas, v: View): string[] {
  const { width, depth } = KRIPPE;
  const f = new Frame(w, KRIPPE.x, GROUND, KRIPPE.z, KRIPPE.front);
  const right = width - 1;
  const back = depth - 1;
  krippeArea().forEach(([x, z]) => clearPlants(w, v, x, z));
  f.fill(0, 0, 0, right, 0, back, 'coarse_dirt');
  pairs([0, right], [0, back]).forEach(([u, dv]) => f.fill(u, 1, dv, u, 3, dv, 'spruce_log[axis=y]'));
  f.fill(1, 1, back, right - 1, 3, back, 'spruce_planks');
  [0, right].forEach((u) => {
    f.fill(u, 1, 1, u, 2, back - 1, 'spruce_planks');
    f.fill(u, 3, 1, u, 3, back - 1, 'spruce_fence');
  });
  // Heu hinter der Krippe (Ochs und Esel liegen links und rechts davon)
  f.set(3, 1, back - 1, 'hay_block[axis=x]');
  f.set(4, 1, back - 1, 'hay_block[axis=x]');
  f.set(4, 2, back - 1, 'hay_block[axis=z]');
  f.set(3, 3, 1, 'lantern[hanging=true]');
  f.set(3, 3, 0, 'light[level=13]');
  const [x1, , z1] = f.at(0, 0, 0);
  const [x2, , z2] = f.at(right, 0, back);
  gableRoof(w, {
    x1: Math.min(x1, x2),
    x2: Math.max(x1, x2),
    z1: Math.min(z1, z2),
    z2: Math.max(z1, z2),
    y: GROUND + 4,
    along: f.frontAxis() === 'x' ? 'x' : 'z',
    material: 'spruce',
    gable: 'spruce_planks',
  });
  return krippeFiguren(f, (x, y, z) => v.now(x, y, z));
}

/** So weit darf eine Figur der Krippe rücken, damit sie nicht in der Stallwand steckt. */
const FIGUR_SPIELRAUM = 0.6;

function krippeFiguren(f: Frame, world: World): string[] {
  const at = (u: number, dv: number): Vec => pointAt(f, u, 1, dv);
  const facing = (from: Vec, to: Vec): number => Math.atan2(to[0] - from[0], to[2] - from[2]);
  const crib = at(3.5, 1.4);
  const front = yawOf(f.front);
  const figure = (kind: string, pos: Vec, yaw: number, parts: readonly ModelPart[]): string[] => {
    const make = (p: Vec): string[] => placeModel(tags(kind), p, yaw, parts);
    return settle(world, pos, make, FIGUR_SPIELRAUM, 0.05) ?? make(pos);
  };
  const mary = at(2.35, 1.2);
  const joseph = at(4.75, 1.3);
  const ox = at(1.45, 2.35);
  const donkey = at(5.55, 2.3);
  const sheep = [at(1.6, -1.6), at(5.2, -1.3), at(2.4, -2.3)];
  const roofTop = pointAt(f, 3.5, 8.3, 2.5);
  return [
    ...figure('krippe', crib, front, krippeMitKind()),
    ...figure('krippe', mary, facing(mary, crib), maria()),
    ...figure('krippe', joseph, facing(joseph, crib), josef()),
    ...figure('krippe', ox, facing(ox, crib), ochse()),
    ...figure('krippe', donkey, facing(donkey, crib), esel()),
    ...sheep.flatMap((p, i) => figure('krippe', p, front + (i - 1) * 0.9, schaf())),
    ...figure('krippe', roofTop, 0, stern(1.5)),
  ];
}

// ---------- Alles zusammen ----------

/** Innere Ecken des Dorfmarkts: auf dem Heuballen steht im Winter eine Laterne statt Kürbis und Melone. */
const MARKT_ECKEN: readonly (readonly [number, number])[] = pairs([-10, 10], [-10, 10]);

/** Weihnachtsmarkt bauen (Blöcke in `w`) und die Anzeige-Wesen liefern. */
export function weihnachtsmarkt(w: Canvas, v: View): string[] {
  STALLS.forEach((s) => stallLight(w, s));
  MARKT_ECKEN.forEach(([x, z]) => w.set(x, GROUND + 2, z, 'lantern'));
  const buden = BUDEN.flatMap((b) => bude(w, v, b));
  const stall = krippe(w, v);
  const gate = eingang(w);
  const world: World = (x, y, z) => v.now(x, y, z);
  return [
    ...STALLS.flatMap(stallDeco),
    ...ringKetten(),
    ...schlossmarktKetten(),
    ...marktbogen(world),
    ...buden,
    ...gate,
    ...stall,
  ];
}
