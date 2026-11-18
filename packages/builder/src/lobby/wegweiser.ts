/* eslint-disable ts-patterns/no-magic-numbers -- a signpost: board sizes and heights as they look right in the game */
/**
 * Wegweiser der Lobby: ein Holzpfosten mit Laterne und echten Pfeil-Brettern, die wirklich in die Richtung ihres Ziels
 * zeigen – Schrift in Schildgröße auf beiden Seiten jedes Bretts, mit einem Pfeil, der für den Leser richtig herum
 * steht (wer von Süden auf ein Brett nach Osten schaut, liest „Schloss →“, von Norden „← Schloss“).
 *
 * Philip (17.11.): Der alte Wegweiser am Nordausgang des Dorfplatzes trug eine riesige schwebende Schrift
 * „↑ Schlossmarkt“ samt aller Modusnamen – man stand schon am Schlossmarkt, der Pfeil zeigte ins Leere und die Schrift
 * verdeckte die Szene. Modusnamen gehören an die Stände, nicht auf den Wegweiser.
 *
 * Der Pfosten (Blöcke) steht auch ohne Lobby-Paket und auf Bedrock; die Bretter sind Anzeigen ohne Hitbox, oberhalb
 * der Kopfhöhe – niemand läuft dagegen.
 */
import type { Canvas } from '../canvas.js';
import { lobbyTags } from '../lobby-tags.js';
import { GROUND } from '../nature.js';
import { range } from '../range.js';
import { OPPOSITE, STEP, type Facing } from '../shapes.js';
import { aroundY, aroundZ, blockDisplay, multiply, textSign, type Vec } from './deko.js';

export interface Arm {
  /** Wohin das Brett zeigt. */
  readonly dir: Facing;
  /** Ziel, kurz (Deutsch · Englisch in einer Zeile). */
  readonly text: string;
}

const TAGS = `Tags:[${lobbyTags(['mm_sign', 'mm_wegweiser'])}]`;
const POST_HEIGHT = 4;
const BOARD = { length: 1.7, height: 0.3, thick: 0.07 } as const;
/** Abstand der Bretter übereinander. */
const ARM_STEP = 0.42;
/** Schriftgröße wie ein Schild: eine Zeile ist gut 0,1 Block hoch. */
const TEXT = 0.42;
/** Rechte Hand, wenn man in diese Richtung schaut. */
const RIGHT_OF: Readonly<Record<Facing, Facing>> = {
  north: 'east',
  east: 'south',
  south: 'west',
  west: 'north',
};
/** Blickrichtung einer Schrift (Grad, Minecraft): lesbar von dieser Seite. */
const READ_FROM: Readonly<Record<Facing, number>> = { south: 0, west: 90, north: 180, east: -90 };

/** Schrift auf einer Seite des Bretts: Pfeil vorne oder hinten, je nachdem, wohin das Brett für den Leser zeigt. */
function label(arm: Arm, side: Facing, at: Vec): string {
  const toRight = RIGHT_OF[OPPOSITE[side]] === arm.dir;
  const text = toRight ? `${arm.text}  →` : `←  ${arm.text}`;
  return textSign(TAGS, at, READ_FROM[side], [{ text, color: 'white', bold: true }], TEXT);
}

/** Ein Pfeil-Brett am Pfosten (Mitte cx, cz) in Höhe y. */
function arm(cx: number, cz: number, y: number, a: Arm): string[] {
  const [dx, dz] = STEP[a.dir];
  const along = dx !== 0;
  const start = 0.46;
  const mid = start + BOARD.length / 2;
  const [mx, mz] = [cx + dx * mid, cz + dz * mid];
  const size: Vec = along
    ? [BOARD.length, BOARD.height, BOARD.thick]
    : [BOARD.thick, BOARD.height, BOARD.length];
  // Spitze: ein auf die Kante gestelltes Quadrat am Ende des Bretts
  const tipAt = start + BOARD.length - 0.02;
  const tipSize = BOARD.height * 0.72;
  const tipTurn = along ? aroundZ(Math.PI / 4) : multiply(aroundY(Math.PI / 2), aroundZ(Math.PI / 4));
  const board = [
    blockDisplay(TAGS, [mx, y, mz], 'spruce_planks', { scale: size }),
    blockDisplay(TAGS, [cx + dx * tipAt, y, cz + dz * tipAt], 'spruce_planks', {
      scale: [tipSize, tipSize, BOARD.thick * 0.98],
      rotation: tipTurn,
    }),
  ];
  // Beide Seiten beschriften: quer zur Richtung des Bretts
  const sides: readonly Facing[] = along ? ['south', 'north'] : ['east', 'west'];
  const texts = sides.map((side) => {
    const [sx, sz] = STEP[side];
    const off = BOARD.thick / 2 + 0.012;
    return label(a, side, [mx + sx * off, y - 0.035, mz + sz * off]);
  });
  return [...board, ...texts];
}

/** Wegweiser bei (x, z): Pfosten mit Laterne, Bretter von oben nach unten in der Reihenfolge von `arms`. */
export function wegweiser(c: Canvas, x: number, z: number, arms: readonly Arm[]): void {
  range(GROUND + 1, GROUND + POST_HEIGHT).forEach((y) => c.set(x, y, z, 'stripped_spruce_log[axis=y]'));
  c.set(x, GROUND + POST_HEIGHT + 1, z, 'lantern');
  const top = GROUND + POST_HEIGHT + 0.7;
  arms.forEach((a, i) => c.extra.push(...arm(x + 0.5, z + 0.5, top - i * ARM_STEP, a)));
}
