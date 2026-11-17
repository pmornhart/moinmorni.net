/* eslint-disable ts-patterns/no-magic-numbers -- decoration pieces: sizes, offsets and colours as the market needs them */
/**
 * Bausteine des Weihnachtsschmucks – zuerst fürs Weihnachtstor gebaut (`weihnachtstor.ts`), jetzt auch für alle Stände
 * des Weihnachtsmarkts, die Glühwein- und Lebkuchenbude und den Marktbogen am Schlossmarkt (`standschmuck.ts`,
 * Philip, 17.11.: „an den Ständen bitte das gleiche wie bei dem Eingang“):
 *
 * - dicker Strang aus Tannenzweigen mit warmen Lichtern und Tannenzapfen (`strang`),
 * - durchhängende Bögen (`swag`), rote Schleifen (`schleife`), Christbaumkugeln (`kugelPart`, mit Paket rund),
 * - Girlande, die sich um einen Pfosten windet (`spiral`).
 *
 * Alles sind Teile eines Modells (`ModelPart`): Mitte und Drehung in eigenen Koordinaten (vorne = +z, oben = +y). Wer
 * sie mit `placeModel` aufstellt, dreht sie als Ganzes – so passt derselbe Schmuck an Stände in jeder Richtung.
 */
import { range } from '../range.js';
import { aroundX, aroundY, aroundZ, multiply, type ModelPart, type Quat, type Vec } from './deko.js';
import { KUGELN, type KugelFarbe } from '../schmuck.js';

export const GREEN = { block: 'spruce_leaves', properties: { persistent: 'true' } } as const;
/** Warme Lichter (wie Kerzen). */
export const WARM: readonly string[] = [
  'glowstone',
  'ochre_froglight',
  'glowstone',
  'shroomlight',
  'ochre_froglight',
];
const BULB = 0.17;
export const KUGEL_FOLGE: readonly KugelFarbe[] = ['rot', 'gold', 'rot', 'silber'];
/** Kugel schräg gestellt: ohne Paket ein Edelstein, mit Paket eine runde Kugel (wie am Christbaum). */
export const SCHRAEG = multiply(aroundY(Math.PI / 4), aroundX(0.6155));
/** Kugeln leuchten nicht, sind aber auch nachts zu sehen. */
export const KUGEL_LICHT = { sky: 15, block: 12 } as const;

type Block = { readonly block: string; readonly properties?: Readonly<Record<string, string>> };

/**
 * Stil des Schmucks: Weihnachten (Tannengrün, rote Schleifen, Kugeln, Tannenzapfen) oder Ostern (Kirsch- und
 * Azaleenblüten mit Grün, Schleifen in Pastell, Ostereier, Weidenkätzchen). Die Form bleibt gleich.
 */
export interface Stil {
  /** Zweige im Wechsel. */
  readonly zweige: readonly Block[];
  readonly lichter: readonly string[];
  /** Schleifen im Wechsel: Schlaufen/Bänder und Knoten. */
  readonly schleifen: readonly { readonly band: string; readonly knoten: string }[];
  /** Kugeln (schräg, mit Paket rund) oder Eier (aufrecht, mit Paket rund und in die Höhe gezogen). */
  readonly schmuck: 'kugel' | 'ei';
  readonly farben: readonly KugelFarbe[];
  /** Was an der Girlande hängt: Tannenzapfen oder Weidenkätzchen. */
  readonly anhaenger: 'zapfen' | 'kaetzchen';
  /** Kleine Tupfen im Kranz (Beeren bzw. Blüten). */
  readonly beeren: string;
}

const leaves = (block: string): Block => ({ block, properties: { persistent: 'true' } });

export const WEIHNACHT: Stil = {
  zweige: [GREEN],
  lichter: WARM,
  schleifen: [{ band: 'red_wool', knoten: 'red_concrete' }],
  schmuck: 'kugel',
  farben: KUGEL_FOLGE,
  anhaenger: 'zapfen',
  beeren: 'red_concrete',
};

export const OSTERN: Stil = {
  zweige: [
    leaves('flowering_azalea_leaves'),
    leaves('cherry_leaves'),
    leaves('azalea_leaves'),
    leaves('cherry_leaves'),
  ],
  lichter: WARM,
  schleifen: [
    { band: 'pink_wool', knoten: 'pink_concrete' },
    { band: 'light_blue_wool', knoten: 'light_blue_concrete' },
    { band: 'yellow_wool', knoten: 'yellow_concrete' },
    { band: 'lime_wool', knoten: 'lime_concrete' },
  ],
  schmuck: 'ei',
  farben: ['rosa', 'gold', 'hellblau', 'gruen', 'lila', 'orange'],
  anhaenger: 'kaetzchen',
  beeren: 'yellow_concrete',
};

/** Zweige einer Girlande: so dick, dass sie wie ein Strang aus Tannenzweigen aussieht. */
export const BRANCH = 0.56;
/** Abstand zweier Zweige entlang der Girlande. */
export const STEP = 0.27;
/**
 * Ein Zweig, um seine Achse gedreht, ragt bis 0,71 seiner Größe zur Seite. So weit (abzüglich eines Hauchs) bleibt
 * die Mitte vom Balken weg – sonst stäke die Girlande im Holz.
 */
export const REACH = 0.7071;
export const TOUCH = 0.06;

/** Zweig-Drehungen im Wechsel, damit der Strang buschig wirkt und nicht wie ein Balken. */
const TWISTS: readonly number[] = [0, Math.PI / 4, Math.PI / 8, (3 * Math.PI) / 8];

export type Axis = 'x' | 'y' | 'z';
const AROUND: Readonly<Record<Axis, (a: number) => Quat>> = { x: aroundX, y: aroundY, z: aroundZ };
const turnAround = (axis: Axis, a: number): Quat => AROUND[axis](a);

/** Ein Tannenzweig der Girlande (Mitte, Größe, um die Achse der Girlande gedreht). */
export function branch(at: Vec, size: number, axis: Axis, k: number, stil: Stil = WEIHNACHT): ModelPart {
  const grow = 1 + ((k * 7) % 5) * 0.03 - 0.06;
  const s = size * grow;
  return {
    at,
    ...(stil.zweige[k % stil.zweige.length] ?? GREEN),
    scale: [s, s, s],
    rotation: turnAround(axis, TWISTS[k % TWISTS.length] ?? 0),
  };
}

export const bulb = (at: Vec, k: number, colours: readonly string[] = WARM): ModelPart => ({
  at,
  block: colours[k % colours.length] ?? 'glowstone',
  scale: [BULB, BULB, BULB],
  glow: true,
});

/** Tannenzapfen: braun, länglich, hängt an der Girlande. */
export const zapfen = (at: Vec): ModelPart[] => [
  { at, block: 'brown_terracotta', scale: [0.17, 0.27, 0.17], rotation: aroundY(Math.PI / 4) },
  { at: [at[0], at[1] + 0.15, at[2]], block: 'stripped_spruce_wood', scale: [0.08, 0.08, 0.08] },
];

/** Weidenkätzchen: silbrig-weißes Pelzchen am braunen Zweiglein. */
const kaetzchen = (at: Vec): ModelPart[] => [
  { at, block: 'white_wool', scale: [0.14, 0.24, 0.14], rotation: aroundY(Math.PI / 4) },
  { at: [at[0], at[1] + 0.17, at[2]], block: 'stripped_spruce_wood', scale: [0.05, 0.12, 0.05] },
];

/** Was an der Girlande hängt (Tannenzapfen bzw. Weidenkätzchen). */
export const anhaenger = (at: Vec, stil: Stil = WEIHNACHT): ModelPart[] =>
  stil.anhaenger === 'kaetzchen' ? kaetzchen(at) : zapfen(at);

/** Schleife (Vorderseite +z): zwei Schlaufen, Knoten, zwei Bänder – Weihnachten rot, Ostern in Pastell. */
export function schleife(at: Vec, size = 1, stil: Stil = WEIHNACHT, k = 0): ModelPart[] {
  const [x, y, z] = at;
  const s = size;
  const farbe = stil.schleifen[k % stil.schleifen.length] ?? { band: 'red_wool', knoten: 'red_concrete' };
  return [
    {
      at: [x - 0.17 * s, y + 0.03 * s, z],
      block: farbe.band,
      scale: [0.3 * s, 0.2 * s, 0.08],
      rotation: aroundZ(0.45),
    },
    {
      at: [x + 0.17 * s, y + 0.03 * s, z],
      block: farbe.band,
      scale: [0.3 * s, 0.2 * s, 0.08],
      rotation: aroundZ(-0.45),
    },
    { at: [x, y, z + 0.02], block: farbe.knoten, scale: [0.12 * s, 0.12 * s, 0.1] },
    {
      at: [x - 0.08 * s, y - 0.2 * s, z],
      block: farbe.band,
      scale: [0.08 * s, 0.32 * s, 0.05],
      rotation: aroundZ(-0.3),
    },
    {
      at: [x + 0.08 * s, y - 0.2 * s, z],
      block: farbe.band,
      scale: [0.08 * s, 0.32 * s, 0.05],
      rotation: aroundZ(0.3),
    },
  ];
}

/**
 * Christbaumkugel (mit Paket rund, ohne Paket ein schräger Würfel) bzw. Osterei (aufrecht, in die Höhe gezogen, mit
 * Paket rund) als Teil eines Modells.
 */
export function kugelPart(at: Vec, size: number, k: number, stil: Stil = WEIHNACHT): ModelPart {
  const farbe = stil.farben[k % stil.farben.length] ?? 'rot';
  return stil.schmuck === 'ei'
    ? { at, block: KUGELN[farbe], scale: [size * 0.8, size * 1.1, size * 0.8], light: KUGEL_LICHT }
    : { at, block: KUGELN[farbe], scale: [size, size, size], rotation: SCHRAEG, light: KUGEL_LICHT };
}

export interface StrangOptions {
  /** Größe der Zweige (Vorgabe `BRANCH`). */
  readonly size?: number;
  /** Abstand der Zweige (Vorgabe `STEP`). */
  readonly step?: number;
  /** Wohin Lichter und Zapfen zeigen (Einheitsvektor, weg vom Holz). */
  readonly out: Vec;
  /** Zapfen nur, wo das gilt (Mitte des Zapfens) – z. B. nicht vor einem Schild. */
  readonly cone?: (at: Vec) => boolean;
  readonly stil?: Stil;
}

/**
 * Gerader Strang von a nach b (längs x oder z) mit warmen Lichtern im Wechsel oben und unten und hängenden Zapfen.
 * Für einen Strang längs x mit `out` = [0, 0, ±1] genau die Girlande des Weihnachtstors.
 */
export function strang(a: Vec, b: Vec, o: StrangOptions): ModelPart[] {
  const size = o.size ?? BRANCH;
  const step = o.step ?? STEP;
  const stil = o.stil ?? WEIHNACHT;
  const axis: Axis = Math.abs(b[0] - a[0]) >= Math.abs(b[2] - a[2]) ? 'x' : 'z';
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const count = Math.max(1, Math.round(length / step));
  const at = (k: number): Vec => [
    a[0] + ((b[0] - a[0]) * k) / count,
    a[1] + ((b[1] - a[1]) * k) / count,
    a[2] + ((b[2] - a[2]) * k) / count,
  ];
  const [ox, , oz] = o.out;
  const green = range(0, count).map((k) => {
    const [x, y, z] = at(k);
    return branch([x, y + (k % 2) * 0.04, z], size, axis, k, stil);
  });
  const lights = range(0, Math.floor(count / 2) - 1).map((i) => {
    const [x, y, z] = at(i * 2 + 1);
    return bulb([x + ox * 0.24, y + (i % 2 ? 0.2 : -0.18), z + oz * 0.24], i, stil.lichter);
  });
  const cones = range(1, Math.floor(count / 6) - 1)
    .map((i): Vec => {
      const [x, y, z] = at(i * 6);
      return [x + ox * 0.1, y - 0.42, z + oz * 0.1];
    })
    .filter((p) => o.cone?.(p) ?? true)
    .flatMap((p) => anhaenger(p, stil));
  return [...green, ...lights, ...cones];
}

/** Durchhängender Bogen von a nach b (Parabel, tiefster Punkt `sag` unter den Enden), vorne (+z) am Holz. */
export function swag(a: Vec, b: Vec, sag: number, size = BRANCH * 0.86, stil: Stil = WEIHNACHT): ModelPart[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) + sag;
  const count = Math.max(4, Math.round(length / (STEP * 0.95)));
  const point = (t: number): Vec => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t),
    a[2] + (b[2] - a[2]) * t,
  ];
  const green = range(0, count).map((k) => branch(point(k / count), size, 'z', k, stil));
  const lights = range(1, count - 1)
    .filter((k) => k % 2 === 0)
    .map((k, i) => {
      const [x, y, z] = point(k / count);
      return bulb([x, y + (i % 2 ? 0.17 : -0.17), z + 0.22], i + k, stil.lichter);
    });
  return [...green, ...lights];
}

export interface SpiralOptions {
  /** Zweig-Größe (Vorgabe 0,44). */
  readonly size?: number;
  /** Windungen von oben bis unten (Vorgabe 1,75). */
  readonly turns?: number;
  /** Nur Teile, deren Mitte (x, z) das erfüllt – z. B. nicht in die Theke hinter dem Pfosten. */
  readonly keep?: (x: number, z: number) => boolean;
  readonly stil?: Stil;
}

/** Girlande, die sich um einen Pfosten (Mitte cx, cz) von oben nach unten windet. */
export function spiral(
  cx: number,
  cz: number,
  top: number,
  bottom: number,
  start: number,
  o: SpiralOptions = {},
): ModelPart[] {
  // Ein Zweig um die Hochachse gedreht ragt bis 0,71 seiner Größe zum Pfosten hin – der Pfosten (an der Ecke 0,57
  // von der Mitte, im Prüf-Maß) bleibt frei.
  const size = o.size ?? 0.44;
  const radius = 0.57 + size * REACH;
  const turns = o.turns ?? 1.75;
  const height = top - bottom;
  const length = Math.hypot(2 * Math.PI * radius * turns, height);
  const count = Math.round(length / 0.25);
  const point = (t: number, r = radius): Vec => {
    const a = start + t * turns * 2 * Math.PI;
    return [cx + Math.cos(a) * r, top - height * t, cz + Math.sin(a) * r];
  };
  const keep = (p: Vec): boolean => o.keep?.(p[0], p[2]) ?? true;
  const stil = o.stil ?? WEIHNACHT;
  const green = range(0, count)
    .map((k) => {
      const t = k / count;
      const a = start + t * turns * 2 * Math.PI;
      return { ...branch(point(t), size, 'y', k, stil), rotation: aroundY(-a + (k % 2) * (Math.PI / 4)) };
    })
    .filter((p) => keep(p.at));
  const lights = range(1, count - 1)
    .filter((k) => k % 3 === 1)
    .map((k, i) => bulb(point(k / count, radius + 0.22), i, stil.lichter))
    .filter((p) => keep(p.at));
  const cones = range(1, count - 1)
    .filter((k) => k % 9 === 5)
    .map((k): Vec => {
      const [x, y, z] = point(k / count, radius + 0.12);
      return [x, y - 0.2, z];
    })
    .filter(keep)
    .flatMap((p) => anhaenger(p, stil));
  return [...green, ...lights, ...cones];
}
