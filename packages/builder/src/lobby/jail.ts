/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: positions in the lobby as the world has them */
/**
 * Gefängnis: Arrestzelle im Keller des Rathauses (Rathaus bei −30/30, Erdgeschoss auf Höhe 65). Wer im Netzwerk ins
 * Gefängnis kommt, landet hier; das Lobby-Plugin hält ihn in den Grenzen `min`…`max` und lässt ihn nach Ablauf frei.
 */
import type { Canvas } from '../canvas.js';
import { GROUND } from '../nature.js';
import { pairs, range } from '../range.js';
import { signText } from '../village.js';
import type { LobbyPoint, LobbyView } from './features.js';

export interface JailCell {
  /** Hier steht man nach dem Einsperren. */
  readonly spawn: LobbyView;
  /** Innenraum (Blockkoordinaten, beide Ecken inklusive). */
  readonly min: LobbyPoint;
  readonly max: LobbyPoint;
}

const X1 = -33;
const X2 = -27;
const Z1 = 32;
const Z2 = 38;
/** Boden der Zelle (man steht eine Höhe darüber), Decke zwei Blöcke unter dem Rathaus-Boden. */
const FLOOR = GROUND - 7;
const HEIGHT = 4;

export const JAIL: JailCell = {
  spawn: { x: -29.5, y: FLOOR + 1, z: 36.5, yaw: 180, pitch: 5 },
  min: { x: X1, y: FLOOR + 1, z: Z1 },
  max: { x: X2, y: FLOOR + HEIGHT, z: Z2 },
};

const WALLS = ['stone_bricks', 'stone_bricks', 'cracked_stone_bricks', 'mossy_stone_bricks', 'stone_bricks'];
const FLOORS = ['cobblestone', 'stone_bricks', 'cobblestone', 'mossy_cobblestone', 'gravel'];
/** Fester, aber nicht gleichförmiger Wechsel – für jede Stelle immer derselbe Stein. */
const patch = (list: readonly string[], x: number, y: number, z: number): string =>
  list[Math.abs(x * 7 + y * 13 + z * 5) % list.length] ?? list[0] ?? 'stone_bricks';

export function buildJail(c: Canvas): void {
  const top = FLOOR + HEIGHT + 1;
  // Hülle: Boden, Decke, vier Wände (alles fest, egal was drumherum liegt), innen Luft.
  pairs(range(X1 - 1, X2 + 1), range(Z1 - 1, Z2 + 1)).forEach(([x, z]) => {
    c.set(x, FLOOR, z, patch(FLOORS, x, FLOOR, z));
    c.set(x, top, z, 'stone_bricks');
    range(FLOOR + 1, top - 1).forEach((y) => {
      const wall = x < X1 || x > X2 || z < Z1 || z > Z2;
      c.set(x, y, z, wall ? patch(WALLS, x, y, z) : 'air');
    });
  });
  // Vergittertes Fenster in der Nordwand, dahinter Licht (als käme es von draußen).
  range(X1 + 2, X2 - 2).forEach((x) =>
    range(FLOOR + 2, FLOOR + 3).forEach((y) => {
      c.set(x, y, Z1 - 1, 'iron_bars');
      c.set(x, y, Z1 - 2, 'ochre_froglight');
    }),
  );
  // Gitter vor der Tür im Süden, dahinter der Gang des Wärters (zu).
  range(X1 + 2, X2 - 2).forEach((x) =>
    range(FLOOR + 1, FLOOR + 3).forEach((y) => c.set(x, y, Z2 + 1, 'iron_bars')),
  );
  // Pritsche aus Holz an der Westwand, Stroh in der Ecke, Eimer, Lampen an Ketten.
  range(Z1 + 1, Z1 + 4).forEach((z) => c.set(X1, FLOOR + 1, z, 'spruce_slab[type=top]'));
  c.set(X2, FLOOR + 1, Z1, 'hay_block');
  c.set(X2, FLOOR + 1, Z1 + 1, 'hay_block');
  c.set(X2 - 1, FLOOR + 1, Z1, 'brown_carpet');
  c.set(X2, FLOOR + 1, Z2 - 1, 'cauldron');
  [
    [X1 + 1, Z1 + 2],
    [X2 - 1, Z1 + 2],
  ].forEach(([x, z]) => {
    c.set(x ?? 0, top - 1, z ?? 0, 'iron_chain[axis=y]');
    c.set(x ?? 0, top - 2, z ?? 0, 'soul_lantern[hanging=true]');
  });
  signText(
    c,
    -29.5,
    FLOOR + 3.2,
    Z2 + 0.4,
    'north',
    [
      { text: '⛓ Arrestzelle\n', color: 'gray', bold: true },
      { text: 'Hier wartest du,\nbis die Strafe vorbei ist.\n', color: 'white' },
      { text: 'Fragen? /msg ans Team', color: 'gray', italic: true },
    ],
    0.6,
  );
}
