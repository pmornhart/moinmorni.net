/* eslint-disable ts-patterns/no-magic-numbers -- decoration plan: positions of the stall parts */
/**
 * Marktstände im Stil der Saison – nur echte Blöcke, keine zusätzlichen Anzeige-Wesen (Philip, 19.11.: FPS):
 *
 * - **Winter:** Weihnachtsmarkt-Buden aus dunklem Holz (Boden und Rückwand Schwarzeiche, Pfosten entrindete
 *   Schwarzeiche), die weißen Bahnen der Markise rot (bei roten Ständen grün), auf den Fässern Lebkuchen (Kuchen),
 *   Kerzenkuchen und Laternen. Den Schnee auf der Markise legt `winter.ts` darüber.
 * - **Ostern:** Frühlings-Stände aus Kirschholz, die weißen Bahnen der Markise rosa (bei rosa Ständen hellblau),
 *   auf den Fässern Tulpen, Maiglöckchen und Schildkröteneier als Ostereier.
 *
 * Die Farbe des Modus (andere Bahnen, Banner hinten) bleibt, Figur und Schild über der Figur bleiben frei. Getauscht
 * wird nur, wo im Bauplan noch der erwartete Block steht; den Rückweg rechnet `seasonPlanOf` bzw. der Winter selbst.
 * Der Sport-Stand fehlt in `STALLS` (baut sich selbst um).
 */
import type { Canvas } from '../canvas.js';
import { STALLS, stallFrame } from './weihnachtsmarkt.js';
import type { View } from './winter-base.js';

export type StandThema = 'winter' | 'ostern';

interface Thema {
  readonly floor: string;
  readonly post: string;
  readonly wall: string;
  /** Neue Farbe der weißen Markisen-Bahnen; `alt`, wenn der Stand selbst diese Farbe hat. */
  readonly stripe: string;
  readonly alt: string;
  readonly goods: readonly string[];
}

const THEMEN: Readonly<Record<StandThema, Thema>> = {
  winter: {
    floor: 'dark_oak_planks',
    post: 'stripped_dark_oak_log[axis=y]',
    wall: 'dark_oak_planks',
    stripe: 'red',
    alt: 'green',
    goods: ['cake', 'red_candle_cake[lit=false]', 'lantern[hanging=false]', 'cake'],
  },
  ostern: {
    floor: 'cherry_planks',
    post: 'stripped_cherry_log[axis=y]',
    wall: 'cherry_planks',
    stripe: 'pink',
    alt: 'light_blue',
    goods: [
      'potted_pink_tulip',
      'turtle_egg[eggs=3,hatch=0]',
      'potted_lily_of_the_valley',
      'potted_red_tulip',
    ],
  },
};

/** Alle Marktstände im Stil `thema` umbauen (Leinwand `w` der Saison über dem Bauplan). */
export function staendeThema(w: Canvas, v: View, thema: StandThema): void {
  const t = THEMEN[thema];
  STALLS.forEach((s) => {
    const f = stallFrame(s);
    const swap = (u: number, y: number, dv: number, from: (b: string) => boolean, to: string): void => {
      const [x, wy, z] = f.at(u, y, dv);
      if (from(v.before(x, wy, z))) w.set(x, wy, z, to);
    };
    // Boden und Rückwand
    [0, 1, 2, 3, 4, 5, 6].forEach((u) => {
      [0, 1, 2, 3].forEach((dv) => swap(u, 0, dv, (b) => b === 'spruce_planks', t.floor));
      [1, 2, 3].forEach((y) => swap(u, y, 3, (b) => b === 'spruce_planks', t.wall));
    });
    // Pfosten
    [0, 6].forEach((u) =>
      [0, 3].forEach((dv) =>
        [1, 2, 3, 4].forEach((y) => swap(u, y, dv, (b) => b.startsWith('stripped_spruce_log'), t.post)),
      ),
    );
    // Markise: weiße Bahnen in der Farbe des Fests
    const colour = /^(\w+)_wool$/.exec(v.before(...f.at(0, 4, -1)))?.[1];
    const stripe = colour === t.stripe ? t.alt : t.stripe;
    [0, 1, 2, 3, 4, 5, 6].forEach((u) =>
      [-1, 0, 1, 2, 3].forEach((dv) =>
        swap(u, dv === -1 ? 4 : 5, dv, (b) => b === 'white_wool', `${stripe}_wool`),
      ),
    );
    // Waren auf den Fässern
    [0, 1, 5, 6].forEach((u, i) => {
      const [x, y, z] = f.at(u, 1, 1);
      if (!v.before(x, y, z).startsWith('barrel')) return;
      swap(u, 2, 1, () => true, t.goods[i] ?? 'cake');
    });
  });
}
