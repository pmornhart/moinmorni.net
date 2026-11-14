/**
 * Frame: baut in eigenen Koordinaten und dreht das Ergebnis in die Welt.
 * u = nach rechts (von vorne gesehen), v = nach hinten ins Gebäude, y = nach oben; (0, 0, 0) = vorne links unten.
 * Die Vorderseite zeigt in Richtung `front`.
 */
import type { Canvas } from './canvas.js';
import { OPPOSITE, STEP, type Facing } from './shapes.js';

export type Local = 'front' | 'back' | 'left' | 'right';

/** Rechts von jemandem, der in Richtung `f` schaut. */
const RIGHT_OF: Readonly<Record<Facing, Facing>> = { north: 'east', east: 'south', south: 'west', west: 'north' };

export class Frame {
  readonly back: Facing;
  /** Rechts aus Sicht von jemandem vor dem Gebäude (schaut auf die Vorderseite, also nach `back`). */
  readonly right: Facing;

  constructor(
    readonly c: Canvas,
    readonly ox: number,
    readonly oy: number,
    readonly oz: number,
    readonly front: Facing,
  ) {
    this.back = OPPOSITE[front];
    this.right = RIGHT_OF[this.back];
  }

  /** Weltkoordinaten für (u, y, v). */
  at(u: number, y: number, v: number): [number, number, number] {
    const [rx, rz] = STEP[this.right];
    const [bx, bz] = STEP[this.back];
    return [this.ox + u * rx + v * bx, this.oy + y, this.oz + u * rz + v * bz];
  }

  dir(local: Local): Facing {
    const map: Record<Local, Facing> = {
      front: this.front,
      back: this.back,
      right: this.right,
      left: OPPOSITE[this.right],
    };
    return map[local];
  }

  set(u: number, y: number, v: number, block: string): void {
    const [x, wy, z] = this.at(u, y, v);
    this.c.set(x, wy, z, block);
  }

  soft(u: number, y: number, v: number, block: string): void {
    const [x, wy, z] = this.at(u, y, v);
    this.c.soft(x, wy, z, block);
  }

  fill(u1: number, y1: number, v1: number, u2: number, y2: number, v2: number, block: string): void {
    const [x1, ya, z1] = this.at(u1, y1, v1);
    const [x2, yb, z2] = this.at(u2, y2, v2);
    this.c.fill(x1, ya, z1, x2, yb, z2, block);
  }

  /** Achse der Vorderseite in Welt-Koordinaten (für Glasscheiben-Verbindungen, Säulen …). */
  frontAxis(): 'x' | 'z' {
    return this.right === 'east' || this.right === 'west' ? 'x' : 'z';
  }
}
