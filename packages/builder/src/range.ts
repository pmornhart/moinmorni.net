/** Kleine Helfer für Zahlenbereiche – damit Bauten ohne Schleifen auskommen. */

/** Alle ganzen Zahlen von `from` bis `to` (beide eingeschlossen, Richtung egal). */
export function range(from: number, to: number): number[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/** `count` gleichmäßige Schritte von 0 bis ausschließlich 1. */
export function steps(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i / count);
}

/** Alle Paare (a, b) aus zwei Bereichen. */
export function pairs(as: readonly number[], bs: readonly number[]): Array<[number, number]> {
  return as.flatMap((a) => bs.map((b): [number, number] => [a, b]));
}

/** Alle Punkte (x, z) in einem Kreis mit Radius r um (cx, cz). */
export function disc(cx: number, cz: number, r: number): Array<[number, number]> {
  const span = range(-Math.ceil(r), Math.ceil(r));
  return pairs(span, span)
    .filter(([dx, dz]) => dx * dx + dz * dz <= r * r)
    .map(([dx, dz]): [number, number] => [cx + dx, cz + dz]);
}

/** Gibt `value` zwischen `lo` und `hi` zurück. */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}
