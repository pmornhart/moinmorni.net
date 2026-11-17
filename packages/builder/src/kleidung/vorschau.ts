/* eslint-disable ts-patterns/no-magic-numbers -- small ray tracer for preview pictures */
/**
 * Vorschau-Bilder der Kleidung ohne Minecraft: ein kleiner Strahlen-Zeichner für Quader mit Texturen (`RenderBox`).
 * Senkrechte Projektion, je Pixel ein Strahl, der nächste getroffene Texel zählt (durchsichtige Texel lassen den
 * Strahl weiter), Licht je Fläche wie in Minecraft (oben hell, unten dunkel, Seiten dazwischen). Für die Webseite und
 * die Übersichtsbilder; die Bilder kommen nur aus unseren eigenen Zeichnungen.
 */
import { Picture } from '../png.js';
import type { Dir, RenderBox, Vec } from './modell.js';

type V = [number, number, number];

const sub = (a: Vec, b: Vec): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec, b: Vec): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec): V => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

/** Punkt um eine Achse drehen (Grad), Drehpunkt `o`. */
function rotate(p: Vec, axis: 'x' | 'y' | 'z', deg: number, o: Vec): V {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const [x, y, z] = sub(p, o);
  const turned: Readonly<Record<'x' | 'y' | 'z', V>> = {
    x: [x, y * c - z * s, y * s + z * c],
    y: [x * c + z * s, y, -x * s + z * c],
    z: [x * c - y * s, x * s + y * c, z],
  };
  return add(turned[axis], o);
}

/** Wie stark eine Fläche beleuchtet ist (wie Minecraft ohne Umgebungs-Verdeckung). */
const LIGHT: Readonly<Record<Dir, number>> = {
  up: 1,
  down: 0.5,
  north: 0.8,
  south: 0.8,
  east: 0.62,
  west: 0.62,
};

/** Ein Satz Quader in einem eigenen Raum: Welt = Versatz + Maßstab × (Punkt − Mitte). */
export interface Scene {
  readonly boxes: readonly RenderBox[];
  readonly scale: number;
  readonly offset: Vec;
  /** Drehpunkt im eigenen Raum (Standard 0,0,0). */
  readonly center?: Vec;
}

export interface Camera {
  /** Blickrichtung: Drehung um die senkrechte Achse in Grad (0 = von vorn, Blick nach +z). */
  readonly yaw: number;
  /** Neigung in Grad (positiv = von oben). */
  readonly pitch: number;
  /** Mitte des Bildes in der Welt. */
  readonly target: Vec;
  /** Welt-Einheiten je Pixel. */
  readonly unit: number;
}

function sample(box: RenderBox, dir: Dir, local: V): [number, number] | null {
  const face = box.faces[dir];
  if (!face) return null;
  const [fx, fy, fz] = box.from;
  const [tx, ty, tz] = box.to;
  const fr = (v: number, a: number, b: number): number => (b - a === 0 ? 0 : (v - a) / (b - a));
  const [x, y, z] = local;
  const st: Readonly<Record<Dir, [number, number]>> = {
    north: [fr(x, tx, fx), fr(y, ty, fy)],
    south: [fr(x, fx, tx), fr(y, ty, fy)],
    west: [fr(z, fz, tz), fr(y, ty, fy)],
    east: [fr(z, tz, fz), fr(y, ty, fy)],
    up: [fr(x, fx, tx), fr(z, fz, tz)],
    down: [fr(x, fx, tx), fr(z, tz, fz)],
  };
  const [s, t] = st[dir];
  const [rx, ry, rw, rh] = face.rect;
  const px = rx + Math.min(rw - 1, Math.max(0, Math.floor(s * rw)));
  const py = ry + Math.min(rh - 1, Math.max(0, Math.floor(t * rh)));
  const i = (py * face.picture.width + px) * 4;
  const d = face.picture.data;
  if ((d[i + 3] ?? 0) < 128) return null;
  return [((d[i] ?? 0) << 16) | ((d[i + 1] ?? 0) << 8) | (d[i + 2] ?? 0), LIGHT[dir]];
}

/** Strahl gegen einen Quader (im eigenen Raum); Entfernung, Fläche und Farbe oder null. */
function hit(box: RenderBox, origin: V, dir: V): { t: number; colour: number } | null {
  const rot = box.rotation;
  const o = rot ? rotate(origin, rot.axis, -rot.angle, rot.origin) : origin;
  const d = rot ? sub(rotate(add(origin, dir), rot.axis, -rot.angle, rot.origin), o) : dir;
  const lo = box.from;
  const hi = box.to;
  const axes: Array<[Dir, Dir]> = [
    ['west', 'east'],
    ['down', 'up'],
    ['north', 'south'],
  ];
  const range = axes.reduce<{ near: number; far: number; face: Dir | null } | null>(
    (acc, [low, high], k) => {
      if (!acc) return null;
      const dk = d[k] ?? 0;
      const ok = o[k] ?? 0;
      if (Math.abs(dk) < 1e-9) return ok < (lo[k] ?? 0) || ok > (hi[k] ?? 0) ? null : acc;
      const t1 = ((lo[k] ?? 0) - ok) / dk;
      const t2 = ((hi[k] ?? 0) - ok) / dk;
      const near = Math.min(t1, t2);
      const far = Math.max(t1, t2);
      const face = t1 < t2 ? low : high;
      const next = near > acc.near ? { near, far: acc.far, face } : acc;
      const out = { ...next, far: Math.min(next.far, far) };
      return out.near > out.far ? null : out;
    },
    { near: -Infinity, far: Infinity, face: null },
  );
  if (!range?.face) return null;
  const p = add(o, mul(d, range.near));
  const c = sample(box, range.face, p);
  if (!c) return null;
  const [r, g, b] = [(c[0] >> 16) & 255, (c[0] >> 8) & 255, c[0] & 255].map((v) => Math.round(v * c[1]));
  return { t: range.near, colour: ((r ?? 0) << 16) | ((g ?? 0) << 8) | (b ?? 0) };
}

/** Szenen zeichnen; durchsichtiger Hintergrund. */
export function render(scenes: readonly Scene[], camera: Camera, width: number, height: number): Picture {
  const yaw = (camera.yaw * Math.PI) / 180;
  const pitch = (camera.pitch * Math.PI) / 180;
  const forward = norm([Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]);
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const pic = new Picture(width, height);
  const FAR = 1000;
  Array.from({ length: width * height }, (_, i) => {
    const px = i % width;
    const py = Math.floor(i / width);
    const world = add(
      add(camera.target, mul(right, (px - width / 2 + 0.5) * camera.unit)),
      mul(up, (height / 2 - py - 0.5) * camera.unit),
    );
    const origin = sub(world, mul(forward, FAR));
    const best = scenes.reduce<{ t: number; colour: number } | null>((acc, scene) => {
      const c = scene.center ?? [0, 0, 0];
      const o = add(mul(sub(origin, scene.offset), 1 / scene.scale), c);
      return scene.boxes.reduce((a, box) => {
        const h = hit(box, o, forward);
        return h && (!a || h.t * scene.scale < a.t) ? { t: h.t * scene.scale, colour: h.colour } : a;
      }, acc);
    }, null);
    if (best) pic.set(px, py, best.colour);
  });
  return pic;
}

/** Bild verkleinern (Mittelwert je Block, auch die Deckkraft) – glatte Kanten für die Webseite. */
export function shrink(pic: Picture, factor: number): Picture {
  const w = Math.floor(pic.width / factor);
  const h = Math.floor(pic.height / factor);
  const out = new Picture(w, h);
  Array.from({ length: w * h }, (_, i) => {
    const x = i % w;
    const y = Math.floor(i / w);
    const acc = [0, 0, 0, 0];
    Array.from({ length: factor * factor }, (__, k) => {
      const j = ((y * factor + Math.floor(k / factor)) * pic.width + x * factor + (k % factor)) * 4;
      const a = pic.data[j + 3] ?? 0;
      acc[0]! += (pic.data[j] ?? 0) * a;
      acc[1]! += (pic.data[j + 1] ?? 0) * a;
      acc[2]! += (pic.data[j + 2] ?? 0) * a;
      acc[3]! += a;
    });
    const a = acc[3]!;
    if (a === 0) return;
    const n = factor * factor;
    out.set(
      x,
      y,
      (Math.round(acc[0]! / a) << 16) | (Math.round(acc[1]! / a) << 8) | Math.round(acc[2]! / a),
      Math.round(a / n),
    );
  });
  return out;
}
