/**
 * Bauplan einer Saison, die auch Blöcke setzt (Winter, Wiesn, Ostern, Halloween): was sie baut (`on`), wie es wieder
 * wird (`off` – genau die alten Blöcke an genau den geänderten Stellen) und ihre Anzeige-Wesen. Jede Saison zeichnet in
 * eine eigene Leinwand `w` über dem Bauplan der Lobby; geändert ist, was sich vom Bauplan unterscheidet.
 */
import { Canvas } from '../canvas.js';
import type { View } from './winter-base.js';

export interface SeasonPlan {
  /** Blöcke der Saison setzen (`fill … strict`). */
  readonly on: readonly string[];
  /** Die alten Blöcke wieder hin – genau an den Stellen, die die Saison geändert hat. */
  readonly off: readonly string[];
  /** Anzeige-Wesen (summon …). */
  readonly displays: readonly string[];
  /** Weitere Befehle der Deko (z. B. Dorfleute ein Stück zur Seite schicken). */
  readonly moves: readonly string[];
  /** Neuer Block je geänderter Stelle. */
  readonly blocks: Canvas;
  /** Alter Block je geänderter Stelle. */
  readonly restore: Canvas;
}

/** Aus der Leinwand der Saison (`w`) und ihren Anzeigen den fertigen Plan machen. */
export function seasonPlanOf(
  v: View,
  w: Canvas,
  displays: readonly string[],
  moves: readonly string[] = [],
): SeasonPlan {
  const blocks = new Canvas();
  const restore = new Canvas();
  w.find(() => true).forEach(([x, y, z, b]) => {
    const old = v.before(x, y, z);
    if (old === b) return;
    // Herkunft (Baum, Gelände …) bleibt – die Bauplan-Prüfung erkennt daran, was wohin wachsen darf
    const origin = w.originAt(x, y, z);
    if (origin) blocks.tagged(origin, () => blocks.set(x, y, z, b));
    else blocks.set(x, y, z, b);
    restore.set(x, y, z, old);
  });
  return { on: blocks.commands(), off: restore.commands(), displays, moves, blocks, restore };
}
