/* eslint-disable ts-patterns/no-magic-numbers -- decoration plan: positions and sizes as the stalls need them */
/**
 * Schmuck der Stände, Buden und des Marktbogens im Winter und zu Ostern: seit 19.11. leer (Philip: „mach die Dinger da
 * weg mit dem Fichtenlaub“ – die Girlanden aus Zweig-Anzeigen sahen im Client wie Laubwürfel aus und kosteten FPS).
 * Die Schnittstelle bleibt, damit Weihnachts- und Ostermarkt unverändert aufrufen können.
 */
import { placeModel, type ModelPart, type Vec } from './deko.js';
import { WEIHNACHT, type Stil } from './girlanden.js';

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
export function markiseSchmuck(_seiten: StandSeiten, _k: number, _stil: Stil = WEIHNACHT): Schmuck {
  // Keine Girlande und keine Schleifen mehr (Philip, 19.11.: „mach die Dinger da weg mit dem Fichtenlaub“)
  return { parts: [], posts: [] };
}

/**
 * Glühwein- und Lebkuchenbude (`bude` in `weihnachtsmarkt.ts`), Rahmen-Koordinaten wie oben: fünf breit (x 0 … 5),
 * Pfosten vorne bei u 0 und 4 (bis y 6), Giebel mit Dachüberstand vorne (z 0 … 1, ab y 6), Schild auf y 5,2.
 */
export function budeSchmuck(_width: number, _k: number, _stil: Stil = WEIHNACHT, _height = 5): Schmuck {
  // Keine Girlande und keine Schleifen mehr (Philip, 19.11.: „mach die Dinger da weg mit dem Fichtenlaub“)
  return { parts: [], posts: [] };
}

/**
 * Marktbogen am Schlossmarkt (`marketArch` in `schlossmarkt.ts`), Modell um die Mitte des Balkens (Welt 0,5 | top |
 * z+0,5): Balken x −7,5 … 7,5, y 0 … 1, z −0,5 … 0,5; Pfosten bei x ±6 (bis y 0), Laternen oben auf den Enden, Wimpel
 * vorn und hinten an x ±2,5 … 5,5 (hängen fast einen Block unter den Balken), dazwischen in der Mitte frei, darunter
 * die Schrift „Schlossmarkt“ und zwei Hängelaternen. Eine Seite – vorn und hinten aufgestellt.
 */
function bogenSeite(_stil: Stil): { readonly side: ModelPart[]; readonly posts: ModelPart[] } {
  // Keine Girlande mehr (Philip, 19.11.)
  return { side: [], posts: [] };
}

/** Marktbogen: Schmuck vorn und hinten, `mid` = Mitte des Balkens, unten (Welt). */
export function bogenSchmuck(tags: string, mid: Vec, stil: Stil = WEIHNACHT): string[] {
  const { side, posts } = bogenSeite(stil);
  return [...placeModel(tags, mid, 0, [...side, ...posts]), ...placeModel(tags, mid, Math.PI, side)];
}
