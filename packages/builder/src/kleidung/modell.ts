/* eslint-disable ts-patterns/no-magic-numbers -- 3D models: positions, sizes and colours of hand-built hats */
/**
 * Kleiner Baukasten für 3D-Modelle im Stil von Blockbench: Quader (`box`) mit Größe, Lage und Drehung, jede Fläche mit
 * einem Maler (`Paint`), der die Fläche Texel für Texel färbt. `build()` packt alle Flächen in eine Textur (Atlas,
 * Kantenlänge 64, 128 oder 256) und schreibt das Modell als JSON für Minecraft (`elements`, `faces`, `uv` in 0 … 16).
 * Dasselbe Modell kann `vorschau.ts` zeichnen (Bilder für die Webseite und die Tests).
 *
 * Texel-Dichte: 1 Texel je Modell-Einheit. Auf dem Kopf ist eine Modell-Einheit 0,625 Skin-Pixel groß (Minecraft
 * verkleinert Kopf-Gegenstände auf 0,625) – Hüte sind also etwas feiner gezeichnet als der Skin, wie gute Packs.
 */
import { Picture } from '../png.js';

export type Dir = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
export type Vec = readonly [number, number, number];
export const DIRS: readonly Dir[] = ['north', 'south', 'east', 'west', 'up', 'down'];

export interface Rotation {
  readonly origin: Vec;
  readonly axis: 'x' | 'y' | 'z';
  /** Minecraft erlaubt −45, −22,5, 0, 22,5, 45. */
  readonly angle: number;
}

/**
 * Färbt einen Texel einer Fläche: `u` von links nach rechts, `v` von oben nach unten (so, wie Minecraft die Fläche von
 * außen zeigt), `w`/`h` Größe der Fläche in Texeln, `frame` Bild der Bildfolge. Ergebnis 0xRRGGBB oder null
 * (durchsichtig – Minecraft schneidet den Texel aus).
 */
export type Paint = (u: number, v: number, w: number, h: number, dir: Dir, frame: number) => number | null;

export interface BoxOptions {
  readonly rotation?: Rotation;
  /** Flächen, die man nie sieht (spart Platz in der Textur). */
  readonly skip?: readonly Dir[];
  /** Texel je Modell-Einheit (Standard 1). */
  readonly density?: number;
}

interface Part {
  readonly from: Vec;
  readonly to: Vec;
  readonly paint: Partial<Record<Dir, Paint>>;
  readonly rotation?: Rotation;
  readonly density: number;
}

/** Ein Quader, wie ihn `vorschau.ts` zeichnet: Lage, Drehung und je Fläche ein Rechteck in einer Textur (Pixel). */
export interface RenderBox {
  readonly from: Vec;
  readonly to: Vec;
  readonly rotation?: Rotation;
  readonly faces: Partial<Record<Dir, RenderFace>>;
}

export interface RenderFace {
  readonly picture: Picture;
  /** x, y, Breite, Höhe in Pixeln der Textur (erstes Bild der Bildfolge). */
  readonly rect: readonly [number, number, number, number];
}

export interface BuiltModel {
  /** Modell-JSON für `assets/<ns>/models/…`. */
  readonly json: unknown;
  /** Textur (bei Bildfolgen alle Bilder untereinander). */
  readonly texture: Picture;
  readonly frames: number;
  /** Für die Vorschau (nur das erste Bild). */
  readonly boxes: readonly RenderBox[];
}

/** Größe einer Fläche in Modell-Einheiten (Breite entlang u, Höhe entlang v). */
export function faceSize(from: Vec, to: Vec, dir: Dir): [number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  if (dir === 'north' || dir === 'south') return [dx, dy];
  if (dir === 'east' || dir === 'west') return [dz, dy];
  return [dx, dz];
}

const ATLAS_SIZES = [64, 128, 256];
const UV_SPAN = 16;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

interface Placed {
  part: number;
  dir: Dir;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Flächen in Reihen packen (höchste zuerst); null, wenn sie nicht in `size` passen. */
function pack(rects: ReadonlyArray<Omit<Placed, 'x' | 'y'>>, size: number): Placed[] | null {
  const sorted = [...rects].sort((a, b) => b.h - a.h || b.w - a.w);
  const state = { x: 0, y: 0, row: 0 };
  const out: Placed[] = [];
  const fits = sorted.every((r) => {
    if (r.w > size) return false;
    if (state.x + r.w > size) {
      state.x = 0;
      state.y += state.row;
      state.row = 0;
    }
    if (state.y + r.h > size) return false;
    out.push({ ...r, x: state.x, y: state.y });
    state.x += r.w;
    state.row = Math.max(state.row, r.h);
    return true;
  });
  return fits ? out : null;
}

export class Modell {
  private readonly parts: Part[] = [];

  constructor(
    /** Textur-Name ohne Namensraum, z. B. `item/kleidung/fischerhut`. */
    readonly texture: string,
    readonly frames = 1,
    readonly namespace = 'moinmorni',
    /** Texel je Modell-Einheit für alle Quader (einzeln über `density` änderbar). */
    readonly density = 1,
  ) {}

  /** Quader von `from` bis `to`; `paint` für alle Flächen gleich oder je Fläche. */
  box(from: Vec, to: Vec, paint: Paint | Partial<Record<Dir, Paint | null>>, options: BoxOptions = {}): this {
    const skip = new Set(options.skip ?? []);
    const byDir: Partial<Record<Dir, Paint>> = {};
    DIRS.filter((d) => !skip.has(d)).forEach((d) => {
      const p = typeof paint === 'function' ? paint : paint[d];
      if (p) byDir[d] = p;
    });
    this.parts.push({
      from,
      to,
      paint: byDir,
      density: options.density ?? this.density,
      ...(options.rotation ? { rotation: options.rotation } : {}),
    });
    return this;
  }

  build(display?: unknown): BuiltModel {
    const rects = this.parts.flatMap((p, i) =>
      DIRS.filter((d) => p.paint[d]).map((dir) => {
        const [fw, fh] = faceSize(p.from, p.to, dir);
        return {
          part: i,
          dir,
          w: Math.max(1, Math.round(fw * p.density)),
          h: Math.max(1, Math.round(fh * p.density)),
        };
      }),
    );
    const found = ATLAS_SIZES.map((s) => ({ s, placed: pack(rects, s) })).find((r) => r.placed);
    if (!found?.placed) throw new Error(`Modell ${this.texture} passt in keine Textur`);
    const size = found.s;
    const texture = new Picture(size, size * this.frames);
    found.placed.forEach((r) => {
      const part = this.parts[r.part]!;
      const paint = part.paint[r.dir]!;
      Array.from({ length: this.frames }, (_, frame) =>
        Array.from({ length: r.w * r.h }, (__, i) => {
          const u = i % r.w;
          const v = Math.floor(i / r.w);
          const c = paint(u, v, r.w, r.h, r.dir, frame);
          if (c !== null) texture.set(r.x + u, r.y + v + frame * size, c);
        }),
      );
    });
    const ref = `${this.namespace}:${this.texture}`;
    const uvScale = UV_SPAN / size;
    const elements = this.parts.map((part, i) => {
      const faces = Object.fromEntries(
        found
          .placed!.filter((r) => r.part === i)
          .map((r) => [
            r.dir,
            {
              uv: [r.x, r.y, r.x + r.w, r.y + r.h].map((n) => round4(n * uvScale)),
              texture: '#t',
            },
          ]),
      );
      return {
        from: part.from.map(round4),
        to: part.to.map(round4),
        ...(part.rotation
          ? {
              rotation: {
                origin: part.rotation.origin.map(round4),
                axis: part.rotation.axis,
                angle: part.rotation.angle,
              },
            }
          : {}),
        faces,
      };
    });
    const boxes: RenderBox[] = this.parts.map((part, i) => ({
      from: part.from,
      to: part.to,
      ...(part.rotation ? { rotation: part.rotation } : {}),
      faces: Object.fromEntries(
        found
          .placed!.filter((r) => r.part === i)
          .map((r) => [r.dir, { picture: texture, rect: [r.x, r.y, r.w, r.h] as const }]),
      ),
    }));
    return {
      json: {
        textures: { t: ref, particle: ref },
        elements,
        ...(display ? { display } : {}),
      },
      texture,
      frames: this.frames,
      boxes,
    };
  }
}

// ---------- Farben und Maler ----------

const BYTE = 255;
const CH = 8;
const clamp = (n: number): number => Math.max(0, Math.min(BYTE, Math.round(n)));
const rgb = (c: number): [number, number, number] => [(c >> 16) & BYTE, (c >> CH) & BYTE, c & BYTE];
const hex = (r: number, g: number, b: number): number => (clamp(r) << 16) | (clamp(g) << CH) | clamp(b);

/** Aufhellen (f > 0) oder abdunkeln (f < 0). */
export function shade(c: number, f: number): number {
  const [r, g, b] = rgb(c);
  return f >= 0
    ? hex(r + (BYTE - r) * f, g + (BYTE - g) * f, b + (BYTE - b) * f)
    : hex(r * (1 + f), g * (1 + f), b * (1 + f));
}

export function mix(a: number, b: number, f: number): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return hex(r1 + (r2 - r1) * f, g1 + (g2 - g1) * f, b1 + (b2 - b1) * f);
}

/** Zufall ohne Zufall (gleiche Eingabe = gleiche Ausgabe, darum gleiche Bytes und SHA-1). */
export function hash(...n: number[]): number {
  const h = n.reduce((acc, v) => Math.imul(acc ^ Math.round(v * 977), 0x9e3779b1) >>> 0, 0x811c9dc5);
  return ((h ^ (h >>> 15)) >>> 0) / 0xffffffff;
}

/** Einfarbig mit leichtem Rauschen und dunklerem Rand – liest sich wie ein Minecraft-Material. */
export function plain(base: number, noise = 0.06, edge = -0.12, seed = 1): Paint {
  return (u, v, w, h, dir) => {
    const n = (hash(u, v, seed, DIRS.indexOf(dir)) - 0.5) * 2 * noise;
    const rim = edge !== 0 && (u === 0 || v === 0 || u === w - 1 || v === h - 1) ? edge : 0;
    return shade(base, n + rim);
  };
}

/** Durchsichtig. */
export const clear: Paint = () => null;
