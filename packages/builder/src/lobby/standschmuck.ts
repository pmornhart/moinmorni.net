/* eslint-disable ts-patterns/no-magic-numbers -- decoration plan: positions and sizes as the stalls need them */
/**
 * Dezenter Weihnachts- bzw. Osterschmuck der Stände (Philip, 19.11.: „etwas dezenter … frisst FPS“ – nur noch eine schlanke
 * Girlande vorn mit ein paar Lichtern und zwei Schleifen; der Rest dieser Beschreibung ist der Stand vom 17.11.: „an den Ständen bitte das gleiche wie bei dem
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
import { BRANCH, REACH, TOUCH, WEIHNACHT, schleife, strang, type Stil } from './girlanden.js';

/** So weit vor der Fläche sitzt die Mitte eines Strangs (die Zweige berühren das Holz gerade). */
const OUT = BRANCH * REACH - TOUCH;
/**
 * An den Ständen etwas weiter auseinander als am Tor (0,27): gut zwanzig Stände – so bleibt die Zahl der Anzeigen im
 * Rahmen, der Strang wirkt aus der Nähe trotzdem dicht.
 */
/** Schlanke Girlande der Marktstände: kleinere, weiter auseinander stehende Zweige. */
const LIP_SIZE = 0.42;
const LIP_OUT = LIP_SIZE * REACH - TOUCH;
const LIP_STEP = 0.85;

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

/**
 * Marktstand (`marketStall` in `village.ts`), Rahmen-Koordinaten: x = u (0 … 7), y über dem Boden, z = −v. Die
 * Markise hängt vorne als Wollstreifen (y 4 … 5, z 0 … 1), das Dach liegt dahinter auf y 5 … 6 (z −4 … 0); Pfosten
 * vorne bei u 0 und 6 (z −1 … 0), dahinter Fässer, an den vorderen Ecken hängen Laternen (y 3 … 4).
 */
export function markiseSchmuck(seiten: StandSeiten, k: number, stil: Stil = WEIHNACHT): Schmuck {
  const front = 1 + LIP_OUT;
  // Stößt ein Nachbarstand an die Ecke, bleibt der Schmuck auf der eigenen Markise
  const from = seiten.left ? 0.1 : 0.4;
  const to = seiten.right ? 6.9 : 6.6;
  // Dezent (Philip, 19.11.): eine schlanke Girlande vorn mit ein paar warmen Lichtern, zwei Schleifen an den Enden,
  // keine Bögen, keine Seitenstränge, keine umwundenen Pfosten. Die Mitte (Name des Stands) bleibt frei.
  const lip = strang([from, 4.86, front], [to, 4.86, front], {
    out: [0, 0, 1],
    cone: () => false,
    size: LIP_SIZE,
    stil,
    step: LIP_STEP,
  });
  const bows = [from + 0.2, to - 0.2].flatMap((x, i) => schleife([x, 4.92, front + 0.3], 0.7, stil, i + k));
  return { parts: [...lip, ...bows], posts: [] };
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
    cone: () => false,
    stil,
    step: LIP_STEP,
  });
  const bows = [-0.6, width + 0.6].flatMap((x, i) =>
    schleife([x, gy - 0.12, front + 0.42], 0.85, stil, i + k),
  );
  return { parts: [...gable, ...bows], posts: [] };
}

/**
 * Marktbogen am Schlossmarkt (`marketArch` in `schlossmarkt.ts`), Modell um die Mitte des Balkens (Welt 0,5 | top |
 * z+0,5): Balken x −7,5 … 7,5, y 0 … 1, z −0,5 … 0,5; Pfosten bei x ±6 (bis y 0), Laternen oben auf den Enden, Wimpel
 * vorn und hinten an x ±2,5 … 5,5 (hängen fast einen Block unter den Balken), dazwischen in der Mitte frei, darunter
 * die Schrift „Schlossmarkt“ und zwei Hängelaternen. Eine Seite – vorn und hinten aufgestellt.
 */
function bogenSeite(stil: Stil): { readonly side: ModelPart[]; readonly posts: ModelPart[] } {
  const edge = 0.5 - 0.12;
  // Dezent (19.11.): nur die Girlande oben auf dem Balken – keine Bögen, keine Schleifen, keine Pfosten
  const crest = strang([-6.4, 1.45, edge], [6.4, 1.45, edge], { out: [0, 0, 1], cone: () => false, stil });
  return { side: crest, posts: [] };
}

/** Marktbogen: Schmuck vorn und hinten, `mid` = Mitte des Balkens, unten (Welt). */
export function bogenSchmuck(tags: string, mid: Vec, stil: Stil = WEIHNACHT): string[] {
  const { side, posts } = bogenSeite(stil);
  return [...placeModel(tags, mid, 0, [...side, ...posts]), ...placeModel(tags, mid, Math.PI, side)];
}
