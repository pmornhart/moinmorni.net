/**
 * Zäune, Mauern, Scheiben und Gitter mit ihren Nachbarn verbinden – so, wie Minecraft es beim Setzen von Hand täte.
 * Die Lobby baut ohne Block-Updates (`strict`): Ohne diesen Schritt bliebe jeder Arm, wie der Bauplan ihn schrieb –
 * Arme ins Leere (Zaun-Enden, Maibaum-Arme) und Lücken, wo ein Nachbar anschließt, man selbst aber nicht (Ecken).
 *
 * Arme, die nichts finden, fallen weg; schließt ein Nachbar mit seinem Arm an, kommt der Gegen-Arm dazu. Neue Arme zu
 * Wänden entstehen nicht von selbst (ein Balkongeländer vor der Hauswand bekäme sonst überall Stummel).
 */
import type { Canvas } from './canvas.js';
import { isConnecting, joins, stateOf } from './pruefung.js';
import { OPPOSITE, STEP, type Facing } from './shapes.js';

const SIDES: readonly Facing[] = ['north', 'east', 'south', 'west'];
const ON = new Set(['true', 'low', 'tall']);

/** Blockzustand aus Name und Eigenschaften (Reihenfolge wie gegeben). */
function stateString(name: string, props: Readonly<Record<string, string>>): string {
  const list = Object.entries(props).map(([k, v]) => `${k}=${v}`);
  return list.length > 0 ? `${name}[${list.join(',')}]` : name;
}

/** Arm-Wert für eine Seite: Mauern haben niedrig/hoch, alles andere wahr/falsch. */
function armValue(isWall: boolean, on: boolean, tall: boolean): string {
  if (!isWall) return on ? 'true' : 'false';
  if (!on) return 'none';
  return tall ? 'tall' : 'low';
}

export function fitConnections(c: Canvas): void {
  const posts = c.find(isConnecting);
  const fixed = posts.map(([x, y, z, block]) => {
    const { name, props } = stateOf(block);
    const isWall = name.endsWith('_wall');
    const next = (d: Facing): string => {
      const [dx, dz] = STEP[d];
      return c.get(x + dx, y, z + dz) ?? 'air';
    };
    const wanted = (d: Facing): boolean => {
      const n = next(d);
      if (!joins(block, n, d)) return false;
      const reachesBack = isConnecting(n) && ON.has(stateOf(n).props[OPPOSITE[d]] ?? '');
      return ON.has(props[d] ?? '') || reachesBack;
    };
    const above = c.get(x, y + 1, z) ?? 'air';
    const covered = above !== 'air' && above !== 'light';
    const arms = Object.fromEntries(SIDES.map((d) => [d, armValue(isWall, wanted(d), covered)]));
    const on = (d: Facing): boolean => ON.has(arms[d] ?? '');
    const straight =
      (on('north') && on('south') && !on('east') && !on('west')) ||
      (on('east') && on('west') && !on('north') && !on('south'));
    const extra: Record<string, string> = isWall ? { up: straight && !covered ? 'false' : 'true' } : {};
    const rest = Object.fromEntries(
      Object.entries(props).filter(([k]) => !SIDES.includes(k as Facing) && k !== 'up'),
    );
    return [x, y, z, stateString(name, { ...rest, ...arms, ...extra })] as const;
  });
  // Herkunft bleibt (die Prüfung erkennt Bauten daran)
  fixed.forEach(([x, y, z, block]) => c.tagged(c.originAt(x, y, z), () => c.set(x, y, z, block)));
}
