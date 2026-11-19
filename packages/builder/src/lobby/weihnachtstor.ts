/* eslint-disable ts-patterns/no-magic-numbers -- a decoration plan: positions, sizes and colours as the gate needs them */
/**
 * Eingangstor des Markts von der Ankunft her (Weihnachten, Ostern) – dezent wie ein echter Markteingang (Philip, 19.11.:
 * „was geht da ab“ – die alte Fassung mit Laubreihe, Bögen, Kränzen, Kugeln und Riesenstern wirkte überladen):
 *
 * - Keine Girlande mehr (die Zweig-Anzeigen sahen im Client wie Laubwürfel aus).
 * - **Holzschild mit Goldrahmen** direkt auf dem Balken, genau mittig über dem Durchgang; der Rahmen ist eine
 *   Goldplatte hinter dem Brett, ringsum gleich breit. Nichts liegt darauf, von oben und hinten nichts Wirres.
 * - Laternen auf den Balkenenden, Kübel mit Busch neben den Pfosten (nur Blöcke), im Winter Schnee auf dem Balken.
 */
import type { Canvas } from '../canvas.js';
import { GROUND } from '../nature.js';
import { range } from '../range.js';
import { placeModel, textSign, type ModelPart } from './deko.js';
import { HALF, tags } from './winter-base.js';
import { WEIHNACHT, type Stil } from './girlanden.js';

/** Lage des Tors: Pfosten bei x1 und x2, Balken in Höhe `height` über dem Boden, quer bei z. */
export interface Tor {
  readonly x1: number;
  readonly x2: number;
  readonly z: number;
  readonly height: number;
}

const KIND = 'eingang';
const LEAVES = 'spruce_leaves[persistent=true]';

type Line = { readonly text: string; readonly color: string; readonly bold?: boolean };

/**
 * Wie das Tor aussieht: Weihnachten (Tannengrün, Schnee, Stern) oder Ostern (Blütenzweige, Ostereier) – Aufbau, Maße
 * und Halt bleiben gleich.
 */
export interface TorThema {
  /** SNBT-Teil `Tags:[…]` aller Anzeigen. */
  readonly tags: string;
  readonly stil: Stil;
  readonly pfosten: string;
  readonly balken: string;
  /** Oben auf dem Balken: Schnee oder nichts. */
  readonly drauf: string | null;
  readonly vorne: readonly Line[];
  readonly hinten: readonly Line[];
  /** Busch im Kübel der Bäumchen. */
  readonly busch: string;
}

export const WEIHNACHTS_TOR: TorThema = {
  tags: tags(KIND),
  stil: WEIHNACHT,
  pfosten: 'spruce_log',
  balken: 'stripped_spruce_log[axis=x]',
  drauf: 'snow[layers=1]',
  vorne: [
    { text: '✦ Weihnachtsmarkt ✦\\n', color: 'gold', bold: true },
    { text: 'Christmas Market', color: 'white' },
  ],
  hinten: [
    { text: '✦ Frohe Weihnachten! ✦\\n', color: 'gold', bold: true },
    { text: 'Merry Christmas', color: 'white' },
  ],
  busch: LEAVES,
};

/** Kübel mit einem Busch (nur Blöcke, keine Anzeige-Wesen) neben einem Pfosten. */
function kuebel(w: Canvas, t: TorThema, x: number, z: number): void {
  w.set(x, GROUND + 1, z, 'barrel[facing=up]');
  w.set(x, GROUND + 2, z, t.busch);
  if (t.drauf) w.set(x, GROUND + 3, z, t.drauf);
}

/** Das ganze Weihnachtstor: Blöcke in `w`, Anzeige-Wesen als Befehle. */
export function weihnachtstor(w: Canvas, tor: Tor): string[] {
  return geschmuecktesTor(w, tor, WEIHNACHTS_TOR);
}

/** Geschmücktes Tor in einem Thema (Weihnachten, Ostern): Blöcke in `w`, Anzeige-Wesen als Befehle. */
export function geschmuecktesTor(w: Canvas, tor: Tor, t: TorThema): string[] {
  const { x1, x2, z, height } = tor;
  const stil = t.stil;
  const beam = GROUND + height;
  // Echte Blöcke: Pfosten, Balken, darauf nur Schnee (Winter), Laternen auf den Enden – keine Laubreihe.
  [x1, x2].forEach((x) => range(GROUND + 1, beam - 1).forEach((y) => w.set(x, y, z, t.pfosten)));
  range(x1, x2).forEach((x) => {
    w.set(x, beam, z, t.balken);
    if (x === x1 || x === x2) w.set(x, beam + 1, z, 'lantern');
    // Schnee nur neben dem Schild – das Schild steht direkt auf dem Balken
    else if (t.drauf && Math.abs(x + HALF - (x1 + x2 + 1) / 2) > 3.4) w.set(x, beam + 1, z, t.drauf);
  });
  [x1 + 3, Math.round((x1 + x2) / 2), x2 - 2].forEach((x) => w.set(x, beam - 1, z + 1, 'light[level=13]'));
  const left = x1;
  const right = x2 + 1;
  const middle = (left + right) / 2;
  // Schild direkt auf dem Balken, mit dünnem Goldrahmen – frei, nichts darauf
  const boardW = 6.4;
  const boardH = 1.3;
  const frame = 0.06;
  const boardY = beam + 1 + frame - 0.03;
  const boardZ = z + HALF;
  const thick = 0.14;
  // Goldrahmen = eine Goldplatte hinter dem Brett, ringsum gleich viel größer und genau gleich mittig (eine Anzeige
  // statt vier dünner Leisten, die einzeln verrutschen konnten)
  const board: ModelPart[] = [
    {
      at: [middle, boardY + boardH / 2, boardZ],
      block: 'gold_block',
      scale: [boardW + 2 * frame, boardH + 2 * frame, thick],
    },
    {
      at: [middle, boardY + boardH / 2, boardZ],
      block: 'dark_oak_planks',
      scale: [boardW, boardH, thick + 0.04],
    },
  ];
  const textY = boardY + 0.3;
  const signs = [
    textSign(t.tags, [middle, textY, boardZ + thick / 2 + 0.05], 0, t.vorne, 1.4),
    textSign(t.tags, [middle, textY, boardZ - thick / 2 - 0.05], 180, t.hinten, 1.25),
  ];
  kuebel(w, t, x1 - 1, z + 2);
  kuebel(w, t, x2 + 1, z + 2);
  return [...placeModel(t.tags, [0, 0, 0], 0, board), ...signs];
}
