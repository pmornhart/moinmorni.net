/* eslint-disable ts-patterns/no-magic-numbers -- Suchweiten und Schritte in Blöcken, wie die Lobby sie braucht */
/**
 * Saison-Deko so aufstellen, wie die Bauplan-Prüfung (`pruefung.ts`) sie sehen will: nichts steckt in einem Block,
 * alles liegt auf dem Boden, an einer Wand oder an einer anderen Anzeige, Ketten hängen an beiden Enden an einem Block.
 * Statt fester Stellen sucht die Deko ihren Platz in der Nähe – so passt sie auch, wenn sich der Bauplan ändert.
 */
import { displayStuck, displayTouches, nearStructure, type World } from '../pruefung.js';
import type { Vec } from './deko.js';

/** So nah muss das Ende einer Kette an einem Block hängen (die Prüfung erlaubt 0,6). */
const HOOK_REACH = 0.5;

/** Versätze (dx, dz) rund um einen Punkt, der nächste zuerst – bis `radius`, im Raster `step`. */
function around(radius: number, step: number): Array<readonly [number, number]> {
  const n = Math.round(radius / step);
  const cells = Array.from({ length: 2 * n + 1 }, (_, i) => (i - n) * step);
  return cells
    .flatMap((dx) => cells.map((dz) => [dx, dz] as const))
    .filter(([dx, dz]) => Math.hypot(dx, dz) <= radius + 1e-9)
    .sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]) || a[0] - b[0] || a[1] - b[1]);
}

/** Steht ein Modell (alle seine Anzeigen) frei, und liegt mindestens ein Teil auf bzw. an einem Block? */
export function stands(w: World, commands: readonly string[]): boolean {
  return commands.every((c) => displayStuck(w, c) === null) && commands.some((c) => displayTouches(w, c));
}

/**
 * Nächste Stelle auf gleicher Höhe (bis `radius` Blöcke), an der das Modell frei steht und aufliegt; null = keine.
 * `make` baut die Befehle des Modells für eine Stelle.
 */
export function settle(
  w: World,
  at: Vec,
  make: (at: Vec) => readonly string[],
  radius = 3,
  step = 0.25,
): string[] | null {
  const found = around(radius, step)
    .map(([dx, dz]) => make([at[0] + dx, at[1], at[2] + dz]))
    .find((commands) => stands(w, commands));
  return found ? [...found] : null;
}

/**
 * Höhe eines Modells: von `top` abwärts (Schritt `step`) bis knapp über dem, worin es stecken würde – dort liegt es
 * auf. Null, wenn es nirgends frei aufliegt.
 */
export function settleDown(
  w: World,
  at: Vec,
  make: (at: Vec) => readonly string[],
  top: number,
  bottom: number,
  step = 0.02,
): string[] | null {
  const heights = Array.from({ length: Math.round((top - bottom) / step) + 1 }, (_, i) => top - i * step);
  const free = (y: number): readonly string[] | null => {
    const commands = make([at[0], y, at[2]]);
    return commands.every((c) => displayStuck(w, c) === null) ? commands : null;
  };
  const firstStuck = heights.findIndex((y) => free(y) === null);
  const lowest = firstStuck === -1 ? heights[heights.length - 1] : heights[firstStuck - 1];
  if (lowest === undefined) return null;
  const commands = free(lowest);
  return commands && commands.some((c) => displayTouches(w, c)) ? [...commands] : null;
}

/**
 * Ende einer Kette an einen Block bringen: entlang der Kette (waagerecht) erst nach außen, dann nach innen, bis ein
 * Block nah genug ist. `other` ist das andere Ende. Null, wenn es in Reichweite keinen gibt.
 */
export function anchorEnd(w: World, end: Vec, other: Vec, outward = 6, inward = 6, step = 0.25): Vec | null {
  const length = Math.hypot(end[0] - other[0], end[2] - other[2]);
  if (length === 0) return null;
  const ux = (end[0] - other[0]) / length;
  const uz = (end[2] - other[2]) / length;
  const reach = Math.max(outward, inward);
  const shifts = Array.from({ length: Math.round(reach / step) + 1 }, (_, i) => i * step)
    .flatMap((t) => (t === 0 ? [0] : [t, -t]))
    .filter((t) => t <= outward && -t <= inward && length + t > 1);
  const hit = shifts
    .map((t): Vec => [end[0] + ux * t, end[1], end[2] + uz * t])
    .find(([x, y, z]) => nearStructure(w, x, y, z, HOOK_REACH));
  return hit ?? null;
}
