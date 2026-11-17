/* eslint-disable ts-patterns/no-magic-numbers -- a decoration plan: positions, sizes and colours as the lobby needs them */
/**
 * Baukasten für die Saisons Wiesn, Ostern und Halloween (der Winter hat seine eigenen Teile in `weihnachtsmarkt.ts`):
 * Tags je Saison, Ketten aus Lichtern oder Wimpeln, Girlanden, der Eingangsbogen von der Ankunft her, das Gerüst der
 * zwei Buden am Eingang und die Ketten im Ring der Marktstände.
 */
import type { Canvas } from '../canvas.js';
import { Frame } from '../frame.js';
import { GROUND } from '../nature.js';
import { pairs, range } from '../range.js';
import { gableRoof } from '../shapes.js';
import {
  aroundX,
  aroundY,
  blockDisplay,
  multiply,
  placeModel,
  textSign,
  type ModelPart,
  type Quat,
  type Vec,
} from './deko.js';
import { pointAt, STALLS, stallCorners, yawOf, BUDEN, EINGANG, type Stall } from './weihnachtsmarkt.js';
import { clearPlants, HALF, type View } from './winter-base.js';

export type DekoSeason = 'wiesn' | 'easter' | 'halloween';

/** Tags der Deko einer Saison: Saison + Art (für Tests und zum Nachsehen im Spiel). */
export const seasonTags = (season: DekoSeason, kind: string): string =>
  `Tags:['mm_season','mm_season_${season}','mm_${season}_${kind}']`;

/** Lichterkette von a nach b mit Durchhang (Lichter leuchten). */
export function bulbs(
  season: DekoSeason,
  kind: string,
  a: Vec,
  b: Vec,
  sag: number,
  colours: readonly string[],
  size = 0.16,
): string[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const count = Math.max(2, Math.floor(length / 0.9));
  return range(0, count).map((i) => {
    const t = i / count;
    const at: Vec = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t),
      a[2] + (b[2] - a[2]) * t,
    ];
    return blockDisplay(seasonTags(season, kind), at, colours[i % colours.length] ?? 'glowstone', {
      scale: [size, size, size],
      glow: true,
    });
  });
}

/** 45° um die Blickachse: aus dem Quadrat wird eine Raute (Wimpel). */
const DIAMOND: Quat = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)];
const FLAG = 0.42;

/** Wimpelkette von a nach b: Rauten quer zur Kette, die obere Spitze an der Schnur. */
export function pennants(
  season: DekoSeason,
  kind: string,
  a: Vec,
  b: Vec,
  sag: number,
  colours: readonly string[],
): string[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const count = Math.max(2, Math.floor(length / 0.9));
  const angle = Math.atan2(b[0] - a[0], b[2] - a[2]) + Math.PI / 2;
  const turn = multiply(aroundY(angle), DIAMOND);
  return range(0, count).map((i) => {
    const t = i / count;
    const at: Vec = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t) - FLAG * HALF,
      a[2] + (b[2] - a[2]) * t,
    ];
    return blockDisplay(seasonTags(season, kind), at, colours[i % colours.length] ?? 'white_wool', {
      scale: [FLAG, FLAG, 0.04],
      rotation: turn,
    });
  });
}

/** Girlande (gerader Strang aus Blättern o. Ä.) mit Lichtern darunter, von a nach b (waagerecht, in Weltkoordinaten). */
export function garlandParts(
  a: Vec,
  b: Vec,
  thick: number,
  green: { readonly block: string; readonly properties?: Readonly<Record<string, string>> },
  lights: readonly string[],
): ModelPart[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const alongX = Math.abs(b[0] - a[0]) >= Math.abs(b[2] - a[2]);
  const strand: ModelPart = {
    at: mid,
    ...green,
    scale: alongX ? [length, thick, thick] : [thick, thick, length],
  };
  const count = Math.max(2, Math.floor(length / 0.9));
  const dots = range(0, count - 1).map((k): ModelPart => {
    const t = (k + HALF) / count;
    return {
      at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - thick * 0.3, a[2] + (b[2] - a[2]) * t],
      block: lights[k % lights.length] ?? 'glowstone',
      scale: [0.15, 0.15, 0.15],
      glow: true,
    };
  });
  return [strand, ...dots];
}

/**
 * Stab von a nach b (Mitte, Länge, Drehung in Richtung und Neigung): `thick` quer, `depth` in der Tiefe (Vorgabe wie
 * `thick`).
 */
export function segment(
  season: DekoSeason,
  kind: string,
  a: Vec,
  b: Vec,
  thick: number,
  block: string,
  depth = thick,
): string {
  const [dx, dy, dz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const flat = Math.hypot(dx, dz);
  const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return blockDisplay(seasonTags(season, kind), mid, block, {
    scale: [depth, thick, Math.hypot(flat, dy)],
    rotation: multiply(aroundY(Math.atan2(dx, dz)), aroundX(-Math.atan2(dy, flat))),
  });
}

/**
 * Felder eines Rings mit Radius r um (ca, cb) – ohne Ecken-Lücken (zwei Felder, die sich nur an einer Ecke berühren,
 * bekommen das passende Feld dazwischen), damit Wasser nicht ausläuft und Blöcke an einem Stück halten.
 */
export function ringCells(ca: number, cb: number, r: number): Array<readonly [number, number]> {
  const onRing = (a: number, b: number): boolean => {
    const d = Math.hypot(a + HALF - ca, b + HALF - cb);
    return d >= r - HALF && d < r + HALF;
  };
  const near = (a: number, b: number): number => Math.abs(Math.hypot(a + HALF - ca, b + HALF - cb) - r);
  const span = (c: number): number[] => range(Math.floor(c - r - 1), Math.ceil(c + r + 1));
  const ring = pairs(span(ca), span(cb)).filter(([a, b]) => onRing(a, b));
  const corners = ring.flatMap(([a, b]) =>
    [1, -1].flatMap((db): Array<readonly [number, number]> => {
      const [na, nb] = [a + 1, b + db];
      const one: readonly [number, number] = [na, b];
      const two: readonly [number, number] = [a, nb];
      if (!onRing(na, nb) || onRing(...one) || onRing(...two)) return [];
      return [near(...one) <= near(...two) ? one : two];
    }),
  );
  return [...ring, ...corners];
}

/** Modell in Weltkoordinaten (Teile mit `at` in der Welt). */
export function inWorld(season: DekoSeason, kind: string, parts: readonly ModelPart[]): string[] {
  return placeModel(seasonTags(season, kind), [0, 0, 0], 0, parts);
}

// ---------- Eingangsbogen von der Ankunft her ----------

export interface GateStyle {
  readonly post: string;
  readonly beam: string;
  /** Wie hoch der Balken liegt (über dem Boden). */
  readonly height: number;
}

/** Pfosten und Balken des Eingangsbogens (wie im Winter: über den Platz vor dem Dorfmarkt). */
export function gateFrame(
  w: Canvas,
  style: GateStyle,
): { readonly x1: number; readonly x2: number; readonly z: number; readonly beam: number } {
  const { x1, x2, z } = EINGANG;
  const beam = GROUND + style.height;
  [x1, x2].forEach((x) => range(GROUND + 1, beam - 1).forEach((y) => w.set(x, y, z, style.post)));
  range(x1, x2).forEach((x) => w.set(x, beam, z, style.beam));
  return { x1, x2, z, beam };
}

/**
 * Schild am Eingangsbogen, oben auf dem Balken zur Ankunft hin. Unter dem Balken lag es genau dort, wo man beim
 * Ankommen hinschaut und der Begrüßungstitel erscheint – beide Schriften überlappten (wie früher am Weihnachtstor).
 */
export function gateSign(
  season: DekoSeason,
  beam: number,
  z: number,
  lines: readonly { readonly text: string; readonly color: string; readonly bold?: boolean }[],
): string {
  return textSign(seasonTags(season, 'eingang'), [HALF, beam + 1.08, z + 0.62], 0, lines, 1.25);
}

// ---------- Buden am Eingang ----------

const BUDE_WIDTH = 5;
const BUDE_DEPTH = 3;
export const BUDE_POSTS = 4;

/** Gerüst einer Bude (Boden, Pfosten, Rückwand, Theke, Satteldach) – wie die Glühweinbude im Winter. */
export function budeGeruest(w: Canvas, v: View, i: 0 | 1, roof: string, gable: string): Frame {
  const b = BUDEN[i] ?? BUDEN[0];
  const f = new Frame(w, b?.x ?? 0, GROUND, b?.z ?? 0, b?.front ?? 'east');
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
    material: roof,
    gable,
  });
  return f;
}

/** Name einer Bude vorne über der Theke. */
export function budeSign(
  season: DekoSeason,
  f: Frame,
  lines: readonly { readonly text: string; readonly color: string; readonly bold?: boolean }[],
): string {
  return textSign(
    seasonTags(season, 'bude'),
    pointAt(f, BUDE_WIDTH / 2, BUDE_POSTS + 0.18, -0.04),
    (-yawOf(f.front) * 180) / Math.PI,
    lines,
    0.62,
  );
}

/** Girlande vorne an der Dachkante einer Bude (in Rahmen-Koordinaten u, y, −v wie `placeModel`). */
export function budeGarland(
  season: DekoSeason,
  f: Frame,
  green: { readonly block: string; readonly properties?: Readonly<Record<string, string>> },
  lights: readonly string[],
): string[] {
  const parts = garlandParts(
    [-1, BUDE_POSTS + 1.12, 1.12],
    [BUDE_WIDTH + 1, BUDE_POSTS + 1.12, 1.12],
    0.3,
    green,
    lights,
  );
  return placeModel(seasonTags(season, 'bude'), pointAt(f, 0, 0, 0), yawOf(f.front), parts);
}

// ---------- Ketten im Ring der Marktstände ----------

/** Kürzer lohnt keine Kette (Stände, die sich an einer Ecke berühren). */
const MIN_CHAIN = 2;

/** Von Stand zu Stand im Ring um den Maibaum (vordere Ecken der Markisen). */
export function ringPairs(): Array<readonly [Vec, Vec]> {
  const ring = STALLS.filter((s: Stall) => s.ring);
  const corners = ring.flatMap((s, i) => stallCorners(s).map((p) => ({ p, stall: i })));
  const angle = (p: Vec): number => Math.atan2(p[2] - HALF, p[0] - HALF);
  const sorted = [...corners].sort((a, b) => angle(a.p) - angle(b.p));
  return sorted.flatMap((c, k) => {
    const next = sorted[(k + 1) % sorted.length];
    if (!next || next.stall === c.stall) return [];
    const gap = Math.hypot(next.p[0] - c.p[0], next.p[2] - c.p[2]);
    return gap < MIN_CHAIN ? [] : [[c.p, next.p] as const];
  });
}
