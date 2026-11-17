/* eslint-disable ts-patterns/no-magic-numbers -- pixel art: colours, shapes and positions of hand-drawn fish */
/**
 * Kleine Pixel-Leinwand für die Fisch-Zeichnungen von Angelkönig: RGBA, Farben als 0xRRGGBB, dazu Helfer für
 * „schräg liegende“ Formen. Ein Fisch liegt wie die Fische im Spiel schräg im Bild (Schwanz unten links, Kopf oben
 * rechts) – gezeichnet wird in einem gedrehten Koordinatensystem: `t` läuft vom Schwanz (0) zur Schnauze (1), `v` ist
 * der Abstand von der Mittellinie in Pixeln (positiv = Rücken).
 */
import { Picture } from '../png.js';

const BYTE = 255;
const CHANNEL = 8;

export const rgb = (c: number): [number, number, number] => [
  (c >> 16) & BYTE,
  (c >> CHANNEL) & BYTE,
  c & BYTE,
];
export const hex = (r: number, g: number, b: number): number =>
  (clamp(r) << 16) | (clamp(g) << CHANNEL) | clamp(b);
const clamp = (n: number): number => Math.max(0, Math.min(BYTE, Math.round(n)));

/** Farbe aufhellen (f > 0, Richtung Weiß) oder abdunkeln (f < 0, Richtung Schwarz). */
export function shade(c: number, f: number): number {
  const [r, g, b] = rgb(c);
  return f >= 0
    ? hex(r + (BYTE - r) * f, g + (BYTE - g) * f, b + (BYTE - b) * f)
    : hex(r * (1 + f), g * (1 + f), b * (1 + f));
}

/** Zwei Farben mischen (0 = a, 1 = b). */
export function mix(a: number, b: number, f: number): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return hex(r1 + (r2 - r1) * f, g1 + (g2 - g1) * f, b1 + (b2 - b1) * f);
}

/** Zufall ohne Zufall: gleiche Eingabe = gleiches Ergebnis (darum gleiche Bytes und gleiche SHA-1). */
export function hash(...n: number[]): number {
  const h = n.reduce((acc, v) => Math.imul(acc ^ Math.round(v * 977), 0x9e3779b1) >>> 0, 0x811c9dc5);
  return ((h ^ (h >>> 15)) >>> 0) / 0xffffffff;
}

export class Leinwand {
  readonly color: Int32Array;
  readonly alpha: Uint8Array;
  /** Was an einem Pixel liegt (für Umriss und Licht): 0 leer, 1 Körper, 2 Flosse, 3 Auge, 4 sonstiges. */
  readonly part: Uint8Array;

  constructor(readonly size: number) {
    this.color = new Int32Array(size * size);
    this.alpha = new Uint8Array(size * size);
    this.part = new Uint8Array(size * size);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  set(x: number, y: number, c: number, part = 4, a = BYTE): void {
    if (!this.inside(x, y)) return;
    const i = y * this.size + x;
    this.color[i] = c;
    this.alpha[i] = a;
    this.part[i] = part;
  }

  get(x: number, y: number): number {
    return this.inside(x, y) ? (this.color[y * this.size + x] ?? 0) : 0;
  }

  filled(x: number, y: number): boolean {
    return this.inside(x, y) && (this.alpha[y * this.size + x] ?? 0) > 0;
  }

  partAt(x: number, y: number): number {
    return this.inside(x, y) ? (this.part[y * this.size + x] ?? 0) : 0;
  }

  /** Jeden Pixel durchgehen. */
  each(fn: (x: number, y: number) => void): void {
    Array.from({ length: this.size * this.size }, (_, i) => fn(i % this.size, Math.floor(i / this.size)));
  }

  /** Umriss: Ränder etwas dunkler, oben links ein Lichtsaum – so liest man die Form auch klein im Inventar. */
  outline(dark = -0.45, light = 0.18): void {
    const edges: Array<[number, number, number]> = [];
    this.each((x, y) => {
      if (!this.filled(x, y)) return;
      const open = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].filter(([dx, dy]) => !this.filled(x + (dx ?? 0), y + (dy ?? 0)));
      if (!open.length) return;
      const lit =
        open.some(([dx, dy]) => (dx ?? 0) < 0 || (dy ?? 0) < 0) && !open.some(([, dy]) => (dy ?? 0) > 0);
      edges.push([x, y, lit ? shade(this.get(x, y), light) : shade(this.get(x, y), dark)]);
    });
    edges.forEach(([x, y, c]) => {
      const i = y * this.size + x;
      this.color[i] = c;
    });
  }

  picture(): Picture {
    const p = new Picture(this.size, this.size);
    this.each((x, y) => {
      const i = y * this.size + x;
      const a = this.alpha[i] ?? 0;
      if (a) p.set(x, y, this.color[i] ?? 0, a);
    });
    return p;
  }

  copy(): Leinwand {
    const c = new Leinwand(this.size);
    c.color.set(this.color);
    c.alpha.set(this.alpha);
    c.part.set(this.part);
    return c;
  }
}

/** Mehrere gleich große Bilder untereinander (Bildfolge für eine bewegte Textur). */
export function stack(frames: readonly Leinwand[]): Picture {
  const size = frames[0]?.size ?? 0;
  const p = new Picture(size, size * frames.length);
  frames.forEach((f, n) =>
    f.each((x, y) => {
      const i = y * size + x;
      const a = f.alpha[i] ?? 0;
      if (a) p.set(x, y + n * size, f.color[i] ?? 0, a);
    }),
  );
  return p;
}

/**
 * Gedrehtes Koordinatensystem: Pixelmitte → (u entlang des Körpers, v quer dazu) in Pixeln. `angle` in Grad gegen
 * den Uhrzeigersinn (45° = Kopf oben rechts).
 */
export function frame(size: number, angle: number, length: number, shift = 0) {
  const a = (angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = -Math.sin(a);
  const half = size / 2;
  return {
    /** t (0 Schwanz … 1 Schnauze) und v (Pixel, + = Rücken) einer Pixelmitte. */
    local(x: number, y: number): { t: number; v: number; u: number } {
      const px = x + 0.5 - half;
      const py = y + 0.5 - half;
      const u = px * dx + py * dy + shift;
      const v = px * dy - py * dx;
      return { t: (u + length / 2) / length, v, u };
    },
  };
}
