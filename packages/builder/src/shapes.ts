/** Grundformen: Quader, Wände, Zylinder, Kugeln, Drehkörper (Kuppeln, Kegel), Dächer, Wege. */
import type { Canvas } from './canvas.js';
import { disc, pairs, range } from './range.js';

export type Facing = 'north' | 'south' | 'east' | 'west';
export type Axis = 'x' | 'z';

const HALF = 0.5;
const SQUARE = 2;

export const OPPOSITE: Readonly<Record<Facing, Facing>> = { north: 'south', south: 'north', east: 'west', west: 'east' };
/** Richtung → Schritt in x/z. */
export const STEP: Readonly<Record<Facing, readonly [number, number]>> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
};
const QUARTER_TURN = 90;
const HALF_TURN = 180;
/** Blickrichtung (yaw) für Teleports und Figuren. */
export const YAW: Readonly<Record<Facing, number>> = {
  south: 0,
  west: QUARTER_TURN,
  north: HALF_TURN,
  east: -QUARTER_TURN,
};

export function stairs(material: string, facing: Facing, half: 'bottom' | 'top' = 'bottom'): string {
  return `${material}_stairs[facing=${facing},half=${half}]`;
}

export function slab(material: string, type: 'bottom' | 'top' | 'double' = 'bottom'): string {
  return `${material}_slab[type=${type}]`;
}

/** Nur die vier Außenwände eines Quaders. */
export function walls(c: Canvas, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: string): void {
  c.fill(x1, y1, z1, x2, y2, z1, block);
  c.fill(x1, y1, z2, x2, y2, z2, block);
  c.fill(x1, y1, z1, x1, y2, z2, block);
  c.fill(x2, y1, z1, x2, y2, z2, block);
}

/** Kreisfläche (y fest). */
export function discAt(c: Canvas, cx: number, y: number, cz: number, r: number, block: string | ((x: number, z: number) => string)): void {
  disc(cx, cz, r).forEach(([x, z]) => c.set(x, y, z, typeof block === 'string' ? block : block(x, z)));
}

/** Zylinder; `hollow` = nur der Mantel. */
export function cylinder(
  c: Canvas,
  cx: number,
  cz: number,
  y1: number,
  y2: number,
  r: number,
  block: string,
  hollow = false,
): void {
  const ring = disc(cx, cz, r).filter(
    ([x, z]) => !hollow || (x - cx) ** SQUARE + (z - cz) ** SQUARE > (r - 1) ** SQUARE,
  );
  range(y1, y2).forEach((y) => ring.forEach(([x, z]) => c.set(x, y, z, block)));
}

/** Drehkörper: `profile[i]` = Radius in Höhe y + i (für Kuppeln, Zwiebeltürme, Kegel). */
export function lathe(c: Canvas, cx: number, y: number, cz: number, profile: readonly number[], block: string): void {
  profile.forEach((r, i) => {
    if (r > 0) discAt(c, cx, y + i, cz, r, block);
    else c.set(cx, y + i, cz, block);
  });
}

/** Ellipsoid (Baumkronen, Felsen, Hügel). */
export function ellipsoid(
  c: Canvas,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  block: string | ((x: number, y: number, z: number) => string | null),
): void {
  const xs = range(Math.floor(cx - rx), Math.ceil(cx + rx));
  const ys = range(Math.floor(cy - ry), Math.ceil(cy + ry));
  const zs = range(Math.floor(cz - rz), Math.ceil(cz + rz));
  pairs(xs, zs).forEach(([x, z]) =>
    ys.forEach((y) => {
      const d = ((x - cx) / rx) ** SQUARE + ((y - cy) / ry) ** SQUARE + ((z - cz) / rz) ** SQUARE;
      if (d > 1) return;
      const b = typeof block === 'string' ? block : block(x, y, z);
      if (b) c.set(x, y, z, b);
    }),
  );
}

export interface RoofSpec {
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
  /** Höhe der Traufe (unterste Dachreihe). */
  readonly y: number;
  /** First verläuft entlang dieser Achse. */
  readonly along: Axis;
  readonly material: string;
  /** Füllung der Giebel und des Dachbodens. */
  readonly gable: string;
  readonly overhang?: number;
  /** Überstand an den Giebelseiten (vorne/hinten). */
  readonly eaves?: number;
}

/** Satteldach aus Treppen, mit Überstand, geschlossenem Giebel und Firstreihe aus Stufen. */
export function gableRoof(c: Canvas, spec: RoofSpec): void {
  const ov = spec.overhang ?? 1;
  const ev = spec.eaves ?? 1;
  const alongX = spec.along === 'x';
  const [a1, a2] = alongX ? [spec.x1 - ev, spec.x2 + ev] : [spec.z1 - ev, spec.z2 + ev];
  const [b1, b2] = alongX ? [spec.z1 - ov, spec.z2 + ov] : [spec.x1 - ov, spec.x2 + ov];
  const [f1, f2]: [Facing, Facing] = alongX ? ['south', 'north'] : ['east', 'west'];
  const width = b2 - b1 + 1;
  const layers = Math.floor(width / SQUARE);
  const put = (a: number, b: number, y: number, block: string): void =>
    alongX ? c.set(a, y, b, block) : c.set(b, y, a, block);
  range(0, layers - 1).forEach((i) => {
    const y = spec.y + i;
    range(a1, a2).forEach((a) => {
      put(a, b1 + i, y, stairs(spec.material, f1));
      put(a, b2 - i, y, stairs(spec.material, f2));
      range(b1 + i + 1, b2 - i - 1).forEach((b) => {
        const inside = a > a1 && a < a2;
        const onWall = alongX ? a === spec.x1 || a === spec.x2 : a === spec.z1 || a === spec.z2;
        if (inside || onWall) put(a, b, y, spec.gable);
      });
    });
  });
  if (width % SQUARE === 1) range(a1, a2).forEach((a) => put(a, b1 + layers, spec.y + layers, slab(spec.material)));
}

/** Weg aus Punkten (x, z) mit Breite, Steine aus einer Auswahl. */
export function path(
  c: Canvas,
  points: ReadonlyArray<readonly [number, number]>,
  width: number,
  y: (x: number, z: number) => number,
  block: (x: number, z: number) => string,
): void {
  points.slice(1).forEach((p, i) => {
    const q = points[i] as readonly [number, number];
    const len = Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), 1);
    range(0, len).forEach((s) => {
      const t = s / len;
      const x = q[0] + (p[0] - q[0]) * t;
      const z = q[1] + (p[1] - q[1]) * t;
      disc(Math.round(x), Math.round(z), width * HALF).forEach(([px, pz]) => c.set(px, y(px, pz), pz, block(px, pz)));
    });
  });
}

const BIOME_STEP = 32;

/** `fillbiome` in Stücken von höchstens 32×32×32 Blöcken (Minecrafts Grenze sind 32 768 Blöcke pro Befehl). */
export function biomeCommands(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, biome: string): string[] {
  const starts = (a: number, b: number): number[] => range(a, b).filter((v) => (v - a) % BIOME_STEP === 0);
  return starts(x1, x2).flatMap((x) =>
    starts(z1, z2).flatMap((z) =>
      starts(y1, y2).map((y) => {
        const end = BIOME_STEP - 1;
        return `fillbiome ${x} ${y} ${z} ${Math.min(x + end, x2)} ${Math.min(y + end, y2)} ${Math.min(z + end, z2)} ${biome}`;
      }),
    ),
  );
}
