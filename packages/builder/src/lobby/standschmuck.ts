/* eslint-disable ts-patterns/no-magic-numbers -- decoration plan: positions and sizes as the stalls need them */
/**
 * Weihnachtsschmuck der Stände wie am Weihnachtstor (Philip, 17.11.: „an den Ständen bitte das gleiche wie bei dem
 * Eingang“ – vorher hing an jeder Markise nur eine dünne, flache Girlande):
 *
 * - **Marktstände** (Dorfmarkt um den Christbaum und Schlossmarkt): dicker Strang aus Tannenzweigen an der Vorderkante
 *   der Markise, an den Seiten entlang des Dachs (nur, wo kein Nachbarstand dicht daneben steht), zwei Bögen links und
 *   rechts mit roten Schleifen, Kugeln, warme Lichter, Zapfen, die Vorderpfosten umwunden. Die Mitte der Markise bleibt
 *   frei: dort steht der Name des Stands, darunter sieht man das Schild über der Figur.
 * - **Glühwein- und Lebkuchenbude:** Strang am Giebel, Schleifen, Kugeln, umwundene Pfosten – das Schild bleibt frei.
 * - **Marktbogen am Schlossmarkt:** die Wimpel und die Schrift „Schlossmarkt“ bleiben frei – der dicke Strang liegt
 *   oben auf dem Balken (vorn und hinten), Bögen mit Schleifen und Kugeln nur zwischen den Wimpeln, die Pfosten unter
 *   den Wimpeln umwunden.
 *
 * Alles in Modell-Koordinaten (vorne = +z): die Stände stellen es mit ihrer Blickrichtung auf (`weihnachtsmarkt.ts`).
 * Die Bausteine kommen aus `girlanden.ts`; ohne Lobby-Paket sind die Kugeln schräge Würfel, sonst rund.
 */
import { placeModel, type ModelPart, type Vec } from './deko.js';
import {
  BRANCH,
  REACH,
  TOUCH,
  WEIHNACHT,
  kugelPart,
  schleife,
  spiral,
  strang,
  swag,
  type Stil,
} from './girlanden.js';

/** So weit vor der Fläche sitzt die Mitte eines Strangs (die Zweige berühren das Holz gerade). */
const OUT = BRANCH * REACH - TOUCH;
const SWAG_SIZE = BRANCH * 0.86;
/** Bögen hängen etwas vor dem Strang. */
const SWAG_OUT = SWAG_SIZE * REACH + 0.02;
/** Strang an den Seiten (etwas dünner). */
const SIDE_SIZE = 0.5;
const SIDE_OUT = SIDE_SIZE * REACH - TOUCH;
/**
 * An den Ständen etwas weiter auseinander als am Tor (0,27): gut zwanzig Stände – so bleibt die Zahl der Anzeigen im
 * Rahmen, der Strang wirkt aus der Nähe trotzdem dicht.
 */
const STAND_STEP = 0.33;
const SIDE_STEP = 0.42;

/** Zwei Bögen von a nach b mit Schleifen an den Enden und einer Kugel in der Mitte, vorne bei `z`. */
function boegen(
  hooks: readonly number[],
  y: number,
  z: number,
  sag: number,
  k: number,
  stil: Stil,
): ModelPart[] {
  const pairs = hooks.slice(1).map((b, i) => [hooks[i] ?? b, b] as const);
  const swags = pairs.flatMap(([a, b]) => swag([a, y, z], [b, y, z], sag, SWAG_SIZE, stil));
  const bows = hooks.map((x, i) => schleife([x, y + 0.06, z + 0.32], 0.85, stil, i + k)).flat();
  const balls = pairs.map(([a, b], i) => kugelPart([(a + b) / 2, y - sag - 0.33, z], 0.27, i + k, stil));
  return [...swags, ...bows, ...balls];
}

export interface StandSeiten {
  /** Linke bzw. rechte Seite frei – kein Nachbarstand dicht daneben (sonst stießen die Zweige aneinander). */
  readonly left: boolean;
  readonly right: boolean;
}

/**
 * Schmuck eines Stands: `parts` sitzen fest an Markise und Dach; `posts` (um die Pfosten gewunden) muss der Aufsteller
 * noch gegen die Welt prüfen – Tischchen, Zäune oder Fässer neben dem Pfosten kennt nur sie.
 */
export interface Schmuck {
  readonly parts: ModelPart[];
  readonly posts: ModelPart[];
}

/** Um einen Pfosten vorne (Mitte x | −0,5) gewunden: nur nach vorn und zur Seite, nicht nach hinten in die Theke. */
const postSpiral = (x: number, top: number, start: number, turns: number, stil: Stil): ModelPart[] =>
  spiral(x, -0.5, top, 1.25, start, { turns, keep: (_x, z) => z > -0.6, stil });

/**
 * Marktstand (`marketStall` in `village.ts`), Rahmen-Koordinaten: x = u (0 … 7), y über dem Boden, z = −v. Die
 * Markise hängt vorne als Wollstreifen (y 4 … 5, z 0 … 1), das Dach liegt dahinter auf y 5 … 6 (z −4 … 0); Pfosten
 * vorne bei u 0 und 6 (z −1 … 0), dahinter Fässer, an den vorderen Ecken hängen Laternen (y 3 … 4).
 */
export function markiseSchmuck(seiten: StandSeiten, k: number, stil: Stil = WEIHNACHT): Schmuck {
  const front = 1 + OUT;
  // Stößt ein Nachbarstand an die Ecke, bleibt der Schmuck auf der eigenen Markise
  const from = seiten.left ? -0.15 : 0.3;
  const to = seiten.right ? 7.15 : 6.7;
  // Name des Stands steht mittig auf der Markise (gut zwei Blöcke breit): dort keine Zapfen, keine Bögen
  const name = (p: Vec): boolean => p[0] < 1.7 || p[0] > 5.3;
  const lip = strang([from, 4.86, front], [to, 4.86, front], {
    out: [0, 0, 1],
    cone: name,
    stil,
    step: STAND_STEP,
  });
  const swagZ = 1 + SWAG_OUT;
  const swags = [
    ...boegen([seiten.left ? 0.1 : 0.55, 2.1], 4.56, swagZ, 0.45, k, stil),
    ...boegen([4.9, seiten.right ? 6.9 : 6.45], 4.56, swagZ, 0.45, k + 1, stil),
  ];
  // Seiten: entlang der Dachkante bis hinten
  const side = (x: number, out: number): ModelPart[] =>
    strang([x, 5.86, -0.1], [x, 5.86, -3.9], { out: [out, 0, 0], size: SIDE_SIZE, stil, step: SIDE_STEP });
  const sides = [...(seiten.left ? side(-SIDE_OUT, -1) : []), ...(seiten.right ? side(7 + SIDE_OUT, 1) : [])];
  // Vorderpfosten umwunden – unter den Laternen (ab y 3), nicht in die Fässer dahinter
  const posts = [0.5, 6.5].flatMap((x, i) => postSpiral(x, 2.85, Math.PI / 2 + i * Math.PI, 1.25, stil));
  return { parts: [...lip, ...swags, ...sides], posts };
}

/**
 * Glühwein- und Lebkuchenbude (`bude` in `weihnachtsmarkt.ts`), Rahmen-Koordinaten wie oben: fünf breit (x 0 … 5),
 * Pfosten vorne bei u 0 und 4 (bis y 6), Giebel mit Dachüberstand vorne (z 0 … 1, ab y 6), Schild auf y 5,2.
 */
export function budeSchmuck(width: number, k: number, stil: Stil = WEIHNACHT, height = 5): Schmuck {
  const front = 1 + OUT;
  const gy = height + 1.12;
  const gable = strang([-1.1, gy, front], [width + 1.1, gy, front], {
    out: [0, 0, 1],
    cone: (p) => p[0] < 0.6 || p[0] > width - 0.6,
    stil,
  });
  const bows = [-0.6, width / 2, width + 0.6].flatMap((x, i) =>
    schleife([x, gy - 0.12, front + 0.42], 0.85, stil, i + k),
  );
  const balls = [-0.3, width + 0.3].map((x, i) => kugelPart([x, gy - 0.5, front + 0.12], 0.27, i + k, stil));
  // Pfosten umwunden (innen Theke und Bretter, hinten die Seitenwand – was dort stäke, nimmt der Aufsteller weg)
  const posts = [0.5, width - 0.5].flatMap((x, i) =>
    postSpiral(x, height + 0.6, Math.PI / 2 + i * Math.PI, 1.75, stil),
  );
  return { parts: [...gable, ...bows, ...balls], posts };
}

/**
 * Marktbogen am Schlossmarkt (`marketArch` in `schlossmarkt.ts`), Modell um die Mitte des Balkens (Welt 0,5 | top |
 * z+0,5): Balken x −7,5 … 7,5, y 0 … 1, z −0,5 … 0,5; Pfosten bei x ±6 (bis y 0), Laternen oben auf den Enden, Wimpel
 * vorn und hinten an x ±2,5 … 5,5 (hängen fast einen Block unter den Balken), dazwischen in der Mitte frei, darunter
 * die Schrift „Schlossmarkt“ und zwei Hängelaternen. Eine Seite – vorn und hinten aufgestellt.
 */
function bogenSeite(stil: Stil): { readonly side: ModelPart[]; readonly posts: ModelPart[] } {
  const edge = 0.5 - 0.12;
  // Oben auf dem Balken: über den Wimpeln, zwischen den Laternen auf den Enden
  const crest = strang([-6.4, 1.45, edge], [6.4, 1.45, edge], { out: [0, 0, 1], cone: () => false, stil });
  // Bögen nur in der freien Mitte zwischen den Wimpeln, auf der Balkenfläche über der Schrift
  const swags = boegen([-2.2, 0, 2.2], 0.82, 0.5 + SWAG_OUT, 0.36, 0, stil);
  // Pfosten unter den Wimpeln umwunden (die Wimpel hängen bis etwa einen Block unter den Balken), bis über die Töpfe
  const posts = [-6, 6].flatMap((x, i) => spiral(x, 0, -1.25, -4.9, Math.PI / 2 + i * Math.PI, { stil }));
  return { side: [...crest, ...swags], posts };
}

/** Marktbogen: Schmuck vorn und hinten, `mid` = Mitte des Balkens, unten (Welt). */
export function bogenSchmuck(tags: string, mid: Vec, stil: Stil = WEIHNACHT): string[] {
  const { side, posts } = bogenSeite(stil);
  return [...placeModel(tags, mid, 0, [...side, ...posts]), ...placeModel(tags, mid, Math.PI, side)];
}
