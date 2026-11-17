/* eslint-disable ts-patterns/no-magic-numbers -- pixel rows of a coat of arms and block offsets */
/**
 * Fahnen, Banner und das Wappen des Schlosses (eigener Entwurf): Smaragd und Gold für MoinMorni, Weiß-Blau für Bayern.
 * Gebraucht am Schlosstor, am Prunkportal unten an der Schlosstreppe und an den Fahnenmasten.
 */
import type { Canvas } from './canvas.js';
import { range } from './range.js';
import type { Facing } from './shapes.js';

/** Muster eines Banners: [Muster, Farbe] in Minecrafts Namen. */
export type BannerPattern = readonly (readonly [pattern: string, colour: string])[];

/** Eine Fahne: Grundfarbe und Muster. */
export interface Flag {
  readonly colour: string;
  readonly patterns: BannerPattern;
}

/** Smaragd mit goldener Raute und Rand. */
export const FLAG_SMARAGD: Flag = {
  colour: 'lime',
  patterns: [
    ['border', 'yellow'],
    ['rhombus', 'yellow'],
  ],
};
/** Weiß-Blau mit weißem Rand. */
export const FLAG_WEISSBLAU: Flag = {
  colour: 'light_blue',
  patterns: [
    ['small_stripes', 'white'],
    ['border', 'white'],
  ],
};
/** Gold mit grünem Kreuz in der Mitte (für die Mitte von Fahnenreihen). */
export const FLAG_GOLD: Flag = {
  colour: 'yellow',
  patterns: [
    ['straight_cross', 'lime'],
    ['circle', 'yellow'],
    ['border', 'lime'],
  ],
};

const patternList = (patterns: BannerPattern): string =>
  patterns.map(([pattern, c]) => `{pattern:"minecraft:${pattern}",color:"${c}"}`).join(',');

/** Wandbanner mit Muster (Block-Daten wie Minecraft sie ab 1.20.5 speichert). */
export function banner(colour: string, facing: Facing, patterns: BannerPattern): string {
  return `${colour}_wall_banner[facing=${facing}]{patterns:[${patternList(patterns)}]}`;
}

/** Stehendes Banner (Fahne auf einem Mast); `rotation` 0 = schaut nach Süden, 4 = Westen, 8 = Norden, 12 = Osten. */
export function standingBanner(flag: Flag, rotation = 0): string {
  return `${flag.colour}_banner[rotation=${rotation}]{patterns:[${patternList(flag.patterns)}]}`;
}

/**
 * Fahnenmast: heller Holzmast (Blasseichen-Zaun – Endstäbe sind dem Prunkbrunnen vorbehalten, das Möbel-Paket blendet
 * sie aus) auf einem Sockel aus Quarz, oben die Fahne, davor unsichtbares Licht (nachts angestrahlt).
 * `y` = Höhe des Sockels, der Mast ist `height` Blöcke hoch, die Fahne steht darüber.
 */
export function flagpole(
  c: Canvas,
  x: number,
  y: number,
  z: number,
  height: number,
  flag: Flag,
  rotation = 0,
): void {
  c.set(x, y, z, 'chiseled_quartz_block');
  range(y + 1, y + height).forEach((py) => c.set(x, py, z, 'pale_oak_fence'));
  c.set(x, y + height + 1, z, standingBanner(flag, rotation));
  c.soft(x, y + height + 1, z + 1, 'light[level=12]');
}

/** Wappen des Schlosses: links Smaragd, rechts Weiß-Blau, Goldrand, Krone. Zeilen von oben. */
export const WAPPEN: readonly string[] = [
  '.G.G.G.',
  '.GGGGG.',
  'GEEGWBG',
  'GEEGBWG',
  'GEEGWBG',
  '.GEGBG.',
  '..GGG..',
];
export const WAPPEN_BLOCKS: Readonly<Record<string, string>> = {
  G: 'gold_block',
  E: 'emerald_block',
  W: 'white_concrete',
  B: 'light_blue_concrete',
};

/** Wappen in eine senkrechte Fläche legen: `put(spalte, zeile, block)` – Spalte −3 … 3, Zeile 0 = oben. */
export function wappen(put: (column: number, row: number, block: string) => void): void {
  WAPPEN.forEach((line, row) =>
    [...line].forEach((cell, j) => {
      const block = WAPPEN_BLOCKS[cell];
      if (block) put(j - 3, row, block);
    }),
  );
}
