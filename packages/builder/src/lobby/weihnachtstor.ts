/* eslint-disable ts-patterns/no-magic-numbers -- a decoration plan: positions, sizes and colours as the gate needs them */
/**
 * Weihnachtstor – der Eingangsbogen des Weihnachtsmarkts von der Ankunft her (Philip, 17.11.: „etwas schöner mit dem
 * Tannen-Zeugs entlang des Tores“):
 *
 * - **Dicke Tannengirlande** vorne und hinten am ganzen Balken, darunter vier **Bögen** (Swags), die zwischen roten
 *   Schleifen durchhängen, und an beiden Pfosten eine Girlande, die sich um den Pfosten hinunterwindet – alles mit
 *   warmen Lichtern, Kugeln und Tannenzapfen.
 * - **Holzschild oben auf dem Balken** („✦ Weihnachtsmarkt ✦ / Christmas Market“, hinten „Frohe Weihnachten!“) mit
 *   Goldrahmen und einem großen Stern darauf, links und rechts davon je ein Kranz mit Schleife.
 *   Das Schild hing früher unter dem Balken – genau dort, wo man beim Ankommen hinschaut, und genau dort, wo der Titel
 *   der Begrüßung („Servus in MoinMorni!“) erscheint: beide Schriften lagen übereinander. Oben auf dem Balken liegt es
 *   über der Bildmitte (von der Ankunft aus gut 17° darüber), die Begrüßung bleibt frei.
 * - **Zwei kleine Christbäume** im Holzkübel neben den Pfosten, Laternen auf den Balkenenden.
 *
 * Ohne Lobby-Paket und auf Bedrock (dort gibt es keine Anzeige-Wesen): echte Blöcke tragen das Tor – eine Reihe
 * Fichtenlaub mit Schnee oben auf dem Balken, Laternen auf den Enden, Kübel mit einem Tannenbusch. Nichts davon
 * schwebt. Die Bausteine (Strang, Bögen, Schleifen, Kugeln, gewundene Pfosten) liegen in `girlanden.ts` und schmücken
 * auch die Stände (`standschmuck.ts`). Alle Blöcke setzt der Winter wie den Schnee – jede andere Saison stellt die Stellen genau wieder her.
 */
import type { Canvas } from '../canvas.js';
import { GROUND } from '../nature.js';
import { range } from '../range.js';
import { aroundY, blockDisplay, placeModel, textSign, type ModelPart, type Vec } from './deko.js';
import { KUGELN } from '../schmuck.js';
import { stern } from './winter-figuren.js';
import { HALF, tags } from './winter-base.js';
import {
  BRANCH,
  GREEN,
  KUGEL_FOLGE,
  KUGEL_LICHT,
  REACH,
  SCHRAEG,
  TOUCH,
  WEIHNACHT,
  branch,
  kugelPart,
  bulb,
  schleife,
  spiral,
  strang,
  swag,
  type Stil,
} from './girlanden.js';

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
  /** Reihe oben auf dem Balken (Block) und darauf (Schnee oder nichts). */
  readonly krone: string;
  readonly drauf: string | null;
  readonly vorne: readonly Line[];
  readonly hinten: readonly Line[];
  /** Obenauf: auf dem Schild und auf den Bäumchen (Größe). */
  readonly spitze: (size: number) => ModelPart[];
  /** Busch im Kübel der Bäumchen. */
  readonly busch: string;
}

export const WEIHNACHTS_TOR: TorThema = {
  tags: tags(KIND),
  stil: WEIHNACHT,
  pfosten: 'spruce_log',
  balken: 'stripped_spruce_log[axis=x]',
  krone: LEAVES,
  drauf: 'snow[layers=1]',
  vorne: [
    { text: '✦ Weihnachtsmarkt ✦\\n', color: 'gold', bold: true },
    { text: 'Christmas Market', color: 'white' },
  ],
  hinten: [
    { text: '✦ Frohe Weihnachten! ✦\\n', color: 'gold', bold: true },
    { text: 'Merry Christmas', color: 'white' },
  ],
  spitze: (size) => stern(size),
  busch: LEAVES,
};

/** Christbaumkugel bzw. Osterei (Block-Anzeige, mit Paket rund). */
function kugel(t: TorThema, at: Vec, size: number, k: number): string {
  if (t.stil.schmuck === 'ei')
    return placeModel(t.tags, [0, 0, 0], 0, [kugelPart(at, size, k, t.stil)])[0] ?? '';
  const farbe = KUGEL_FOLGE[k % KUGEL_FOLGE.length] ?? 'rot';
  return blockDisplay(t.tags, at, KUGELN[farbe], {
    scale: [size, size, size],
    rotation: SCHRAEG,
    light: KUGEL_LICHT,
  });
}

/** Gerade Girlande längs x (Balken) mit Lichtern und Zapfen; `out` = +1 vorne (Süden), −1 hinten. */
const straight = (x1: number, x2: number, y: number, z: number, out: number, stil: Stil): ModelPart[] =>
  strang([x1, y, z], [x2, y, z], { out: [0, 0, out], stil });

/** Kranz, aufrecht (Vorderseite +z), unten bei `at`: Ring aus Zweigen, Schleife unten, rote Beeren. */
function kranz(at: Vec, radius: number, stil: Stil): ModelPart[] {
  const [x, y, z] = at;
  const cy = y + radius + 0.12;
  const count = 14;
  const ring = range(0, count - 1).map((k) => {
    const a = (k / count) * 2 * Math.PI;
    return branch([x + Math.cos(a) * radius, cy + Math.sin(a) * radius, z], 0.25, 'z', k, stil);
  });
  const berries = [0.9, 2.3, 3.6, 5.1].map((a): ModelPart => ({
    at: [x + Math.cos(a) * radius, cy + Math.sin(a) * radius, z + 0.13],
    block: stil.beeren,
    scale: [0.09, 0.09, 0.09],
  }));
  return [...ring, ...berries, ...schleife([x, cy - radius + 0.22, z + 0.14], 0.7, stil)];
}

/** Kleiner Christbaum im Kübel: Kübel und ein Tannenbusch als Blöcke, darüber die Spitze als Anzeigen. */
function baeumchen(w: Canvas, t: TorThema, x: number, z: number, k: number): string[] {
  const stil = t.stil;
  w.set(x, GROUND + 1, z, 'barrel[facing=up]');
  w.set(x, GROUND + 2, z, t.busch);
  if (t.drauf) w.set(x, GROUND + 3, z, t.drauf);
  const cx = x + HALF;
  const cz = z + HALF;
  const base = GROUND + 3 + (t.drauf ? 0.125 : 0);
  // Zweige rund um den Busch – nur so weit hinein, dass sie nicht im Laub stecken (Prüf-Maß: 0,1)
  const skirt = [
    [0.62, 0],
    [-0.62, 0],
    [0, 0.62],
    [0, -0.62],
    [0.6, 0.6],
    [-0.6, 0.6],
    [0.6, -0.6],
    [-0.6, -0.6],
  ].map(([dx = 0, dz = 0], i): ModelPart => ({
    ...branch([cx + dx * 1.08, GROUND + 2.5 + (i % 2) * 0.08, cz + dz * 1.08], 0.36, 'y', i, stil),
    rotation: aroundY(0),
  }));
  const tiers: ModelPart[] = [
    [0.95, 0.24],
    [0.75, 0.58],
    [0.55, 0.88],
    [0.36, 1.14],
    [0.2, 1.34],
  ].flatMap(([s = 0, dy = 0], i) => [
    {
      at: [cx, base + dy, cz],
      ...(stil.zweige[i % stil.zweige.length] ?? GREEN),
      scale: [s, s * 0.62, s],
      rotation: aroundY(Math.PI / 4),
    },
    {
      at: [cx, base + dy + 0.04, cz],
      ...(stil.zweige[(i + 1) % stil.zweige.length] ?? GREEN),
      scale: [s * 0.85, s * 0.6, s * 0.85],
      rotation: aroundY(i * 0.4),
    },
  ]);
  const lights = range(0, 7).map((i) => {
    const a = i * 2.4 + k;
    const level = (i % 4) * 0.27 + 0.2;
    const r = 0.46 - level * 0.28;
    return bulb([cx + Math.cos(a) * r, base + level, cz + Math.sin(a) * r], i, stil.lichter);
  });
  const top = placeModel(t.tags, [cx, base + 1.62, cz], 0, t.spitze(0.5));
  const balls = [0, 2.1, 4.2].map((a, i) =>
    kugel(t, [cx + Math.cos(a + k) * 0.36, base + 0.42 + i * 0.08, cz + Math.sin(a + k) * 0.36], 0.17, i + k),
  );
  return [...placeModel(t.tags, [0, 0, 0], 0, [...skirt, ...tiers, ...lights]), ...top, ...balls];
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
  // Echte Blöcke: Pfosten, Balken, eine Reihe Fichtenlaub mit Schnee darauf, Laternen auf den Enden.
  [x1, x2].forEach((x) => range(GROUND + 1, beam - 1).forEach((y) => w.set(x, y, z, t.pfosten)));
  range(x1, x2).forEach((x) => {
    w.set(x, beam, z, t.balken);
    w.set(x, beam + 1, z, t.krone);
    if (x === x1 || x === x2) w.set(x, beam + 2, z, 'lantern');
    else if (t.drauf) w.set(x, beam + 2, z, t.drauf);
  });
  // Warmes Licht unter dem Balken (zum Weg) und am Schild – nachts sieht man das Tor schon von der Ankunft
  [x1 + 3, Math.round((x1 + x2) / 2), x2 - 2].forEach((x) => w.set(x, beam - 1, z + 1, 'light[level=13]'));
  w.set(Math.round((x1 + x2) / 2), beam + 3, z + 1, 'light[level=12]');
  const left = x1;
  const right = x2 + 1;
  const middle = (left + right) / 2;
  const front = z + 1;
  const back = z;
  const gy = beam + 0.86;
  const out = BRANCH * REACH - TOUCH;
  // Girlanden vorne und hinten am Balken, etwas über die Pfosten hinaus
  const garlands = [
    ...straight(left - 0.15, right + 0.15, gy, front + out, 1, stil),
    ...straight(left - 0.15, right + 0.15, gy, back - out, -1, stil),
  ];
  // Vier Bögen vorne, zwischen Schleifen an den Pfosten und auf dem Balken
  const hooks = range(0, 4).map((i) => left + HALF + ((right - left - 1) * i) / 4);
  const swagZ = front + BRANCH * 0.86 * REACH + 0.02;
  const swags = hooks.slice(1).flatMap((hx, i) => {
    const prev = hooks[i] ?? left;
    return swag([prev, beam + 0.66, swagZ], [hx, beam + 0.66, swagZ], 0.82, undefined, stil);
  });
  const bows = hooks.flatMap((hx, i) => schleife([hx, beam + 0.72, swagZ + 0.32], 1.25, stil, i));
  const balls = hooks.slice(1).map((hx, i) => {
    const prev = hooks[i] ?? left;
    return kugel(t, [(prev + hx) / 2, beam + 0.66 - 0.82 - 0.36, swagZ], 0.3, i);
  });
  // Um die Pfosten gewunden (oben unter dem Balken bis knapp über den Schnee)
  const spirals = [
    ...spiral(x1 + HALF, z + HALF, beam - 0.32, GROUND + 2.1, Math.PI / 2, { stil }),
    ...spiral(x2 + HALF, z + HALF, beam - 0.32, GROUND + 2.1, Math.PI / 2, { stil }),
  ];
  // Schild oben auf dem Balken (auf dem Schnee über dem Laub), mit Goldrahmen
  const boardW = 6.4;
  const boardH = 1.45;
  // Auf zwei kurzen Füßen über dem Laub – sonst verdeckt die Laubreihe von unten gesehen die zweite Zeile
  const legs = 0.4;
  const boardY = beam + 2 + legs;
  const boardZ = z + HALF;
  const thick = 0.14;
  const frame = 0.07;
  const board: ModelPart[] = [
    ...[middle - boardW / 2 + 0.6, middle + boardW / 2 - 0.6].map((x): ModelPart => ({
      at: [x, beam + 2 + legs / 2 + 0.01, boardZ],
      block: 'stripped_dark_oak_log',
      scale: [0.16, legs + 0.02, 0.16],
    })),
    { at: [middle, boardY + boardH / 2, boardZ], block: 'dark_oak_planks', scale: [boardW, boardH, thick] },
    ...[boardY + frame / 2, boardY + boardH - frame / 2].map((y): ModelPart => ({
      at: [middle, y, boardZ],
      block: 'gold_block',
      scale: [boardW + 0.02, frame, thick + 0.04],
    })),
    ...[middle - boardW / 2, middle + boardW / 2].map((x): ModelPart => ({
      at: [x, boardY + boardH / 2, boardZ],
      block: 'gold_block',
      scale: [frame, boardH, thick + 0.04],
    })),
  ];
  const textY = boardY + 0.36;
  const signs = [
    textSign(t.tags, [middle, textY, boardZ + thick / 2 + 0.03], 0, t.vorne, 1.45),
    textSign(t.tags, [middle, textY, boardZ - thick / 2 - 0.03], 180, t.hinten, 1.3),
  ];
  const star = placeModel(t.tags, [middle, boardY + boardH + 0.62, boardZ], 0, t.spitze(1.5));
  // Kränze links und rechts vom Schild, auf dem Schnee über dem Laub
  const wreaths = [middle - boardW / 2 - 1.05, middle + boardW / 2 + 1.05].flatMap((x) =>
    kranz([x, beam + 2, boardZ], 0.4, stil),
  );
  const trees = [...baeumchen(w, t, x1 - 1, z + 2, 0), ...baeumchen(w, t, x2 + 1, z + 2, 1)];
  return [
    ...placeModel(t.tags, [0, 0, 0], 0, [...garlands, ...swags, ...bows, ...spirals, ...board, ...wreaths]),
    ...balls,
    ...star,
    ...signs,
    ...trees,
  ];
}
