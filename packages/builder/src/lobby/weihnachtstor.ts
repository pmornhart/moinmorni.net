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
 * schwebt. Alle Blöcke setzt der Winter wie den Schnee – jede andere Saison stellt die Stellen genau wieder her.
 */
import type { Canvas } from '../canvas.js';
import { GROUND } from '../nature.js';
import { range } from '../range.js';
import {
  aroundX,
  aroundY,
  aroundZ,
  blockDisplay,
  multiply,
  placeModel,
  textSign,
  type ModelPart,
  type Quat,
  type Vec,
} from './deko.js';
import { KUGELN, type KugelFarbe } from '../schmuck.js';
import { stern } from './winter-figuren.js';
import { HALF, tags } from './winter-base.js';

/** Lage des Tors: Pfosten bei x1 und x2, Balken in Höhe `height` über dem Boden, quer bei z. */
export interface Tor {
  readonly x1: number;
  readonly x2: number;
  readonly z: number;
  readonly height: number;
}

const KIND = 'eingang';
const GREEN = { block: 'spruce_leaves', properties: { persistent: 'true' } } as const;
const LEAVES = 'spruce_leaves[persistent=true]';
/** Warme Lichter (wie Kerzen), dazwischen ab und zu ein rotes. */
const WARM: readonly string[] = [
  'glowstone',
  'ochre_froglight',
  'glowstone',
  'shroomlight',
  'ochre_froglight',
];
const BULB = 0.17;
const KUGEL_FOLGE: readonly KugelFarbe[] = ['rot', 'gold', 'rot', 'silber'];
/** Kugel schräg gestellt: ohne Paket ein Edelstein, mit Paket eine runde Kugel (wie am Christbaum). */
const SCHRAEG = multiply(aroundY(Math.PI / 4), aroundX(0.6155));

/** Zweige einer Girlande: so dick, dass sie wie ein Strang aus Tannenzweigen aussieht. */
const BRANCH = 0.56;
/** Abstand zweier Zweige entlang der Girlande. */
const STEP = 0.27;
/**
 * Ein Zweig, um seine Achse gedreht, ragt bis 0,71 seiner Größe zur Seite. So weit (abzüglich eines Hauchs) bleibt
 * die Mitte vom Balken weg – sonst stäke die Girlande im Holz.
 */
const REACH = 0.7071;
const TOUCH = 0.06;

/** Zweig-Drehungen im Wechsel, damit der Strang buschig wirkt und nicht wie ein Balken. */
const TWISTS: readonly number[] = [0, Math.PI / 4, Math.PI / 8, (3 * Math.PI) / 8];

type Axis = 'x' | 'y' | 'z';
const AROUND: Readonly<Record<Axis, (a: number) => Quat>> = { x: aroundX, y: aroundY, z: aroundZ };
const turnAround = (axis: Axis, a: number): Quat => AROUND[axis](a);

/** Ein Tannenzweig der Girlande (Mitte, Größe, um die Achse der Girlande gedreht). */
function branch(at: Vec, size: number, axis: Axis, k: number): ModelPart {
  const grow = 1 + ((k * 7) % 5) * 0.03 - 0.06;
  const s = size * grow;
  return {
    at,
    ...GREEN,
    scale: [s, s, s],
    rotation: turnAround(axis, TWISTS[k % TWISTS.length] ?? 0),
  };
}

const bulb = (at: Vec, k: number, colours: readonly string[] = WARM): ModelPart => ({
  at,
  block: colours[k % colours.length] ?? 'glowstone',
  scale: [BULB, BULB, BULB],
  glow: true,
});

/** Tannenzapfen: braun, länglich, hängt an der Girlande. */
const zapfen = (at: Vec): ModelPart[] => [
  { at, block: 'brown_terracotta', scale: [0.17, 0.27, 0.17], rotation: aroundY(Math.PI / 4) },
  { at: [at[0], at[1] + 0.15, at[2]], block: 'stripped_spruce_wood', scale: [0.08, 0.08, 0.08] },
];

/** Rote Schleife (Vorderseite +z): zwei Schlaufen, Knoten, zwei Bänder. */
function schleife(at: Vec, size = 1): ModelPart[] {
  const [x, y, z] = at;
  const s = size;
  return [
    {
      at: [x - 0.17 * s, y + 0.03 * s, z],
      block: 'red_wool',
      scale: [0.3 * s, 0.2 * s, 0.08],
      rotation: aroundZ(0.45),
    },
    {
      at: [x + 0.17 * s, y + 0.03 * s, z],
      block: 'red_wool',
      scale: [0.3 * s, 0.2 * s, 0.08],
      rotation: aroundZ(-0.45),
    },
    { at: [x, y, z + 0.02], block: 'red_concrete', scale: [0.12 * s, 0.12 * s, 0.1] },
    {
      at: [x - 0.08 * s, y - 0.2 * s, z],
      block: 'red_wool',
      scale: [0.08 * s, 0.32 * s, 0.05],
      rotation: aroundZ(-0.3),
    },
    {
      at: [x + 0.08 * s, y - 0.2 * s, z],
      block: 'red_wool',
      scale: [0.08 * s, 0.32 * s, 0.05],
      rotation: aroundZ(0.3),
    },
  ];
}

/** Christbaumkugel (Block-Anzeige, mit Paket rund). */
function kugel(at: Vec, size: number, k: number): string {
  const farbe = KUGEL_FOLGE[k % KUGEL_FOLGE.length] ?? 'rot';
  return blockDisplay(tags(KIND), at, KUGELN[farbe], {
    scale: [size, size, size],
    rotation: SCHRAEG,
    light: { sky: 15, block: 12 },
  });
}

/** Gerade Girlande längs x (Balken) mit Lichtern und Zapfen; `out` = +1 vorne (Süden), −1 hinten. */
function straight(x1: number, x2: number, y: number, z: number, out: number): ModelPart[] {
  const count = Math.round((x2 - x1) / STEP);
  const at = (k: number): number => x1 + ((x2 - x1) * k) / count;
  const green = range(0, count).map((k) => branch([at(k), y + (k % 2) * 0.04, z], BRANCH, 'x', k));
  const lights = range(0, Math.floor(count / 2) - 1).map((i) =>
    bulb([at(i * 2 + 1), y + (i % 2 ? 0.2 : -0.18), z + out * 0.24], i),
  );
  const cones = range(1, Math.floor(count / 6) - 1).flatMap((i) =>
    zapfen([at(i * 6), y - 0.42, z + out * 0.1]),
  );
  return [...green, ...lights, ...cones];
}

/** Durchhängender Bogen von a nach b (Parabel, tiefster Punkt `sag` unter den Enden), vorne am Tor. */
function swag(a: Vec, b: Vec, sag: number): ModelPart[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) + sag;
  const count = Math.max(4, Math.round(length / (STEP * 0.95)));
  const point = (t: number): Vec => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t),
    a[2] + (b[2] - a[2]) * t,
  ];
  const green = range(0, count).map((k) => branch(point(k / count), BRANCH * 0.86, 'z', k));
  const lights = range(1, count - 1)
    .filter((k) => k % 2 === 0)
    .map((k, i) => {
      const [x, y, z] = point(k / count);
      return bulb([x, y + (i % 2 ? 0.17 : -0.17), z + 0.22], i + k);
    });
  return [...green, ...lights];
}

/** Girlande, die sich um einen Pfosten (Mitte cx, cz) von oben nach unten windet. */
function spiral(cx: number, cz: number, top: number, bottom: number, start: number): ModelPart[] {
  // Ein Zweig um die Hochachse gedreht ragt bis 0,71 seiner Größe zum Pfosten hin – der Pfosten (an der Ecke 0,57
  // von der Mitte, im Prüf-Maß) bleibt frei.
  const size = 0.44;
  const radius = 0.57 + size * REACH;
  const turns = 1.75;
  const height = top - bottom;
  const length = Math.hypot(2 * Math.PI * radius * turns, height);
  const count = Math.round(length / 0.25);
  const point = (t: number, r = radius): Vec => {
    const a = start + t * turns * 2 * Math.PI;
    return [cx + Math.cos(a) * r, top - height * t, cz + Math.sin(a) * r];
  };
  const green = range(0, count).map((k) => {
    const t = k / count;
    const a = start + t * turns * 2 * Math.PI;
    return { ...branch(point(t), size, 'y', k), rotation: aroundY(-a + (k % 2) * (Math.PI / 4)) };
  });
  const lights = range(1, count - 1)
    .filter((k) => k % 3 === 1)
    .map((k, i) => bulb(point(k / count, radius + 0.22), i));
  const cones = range(1, count - 1)
    .filter((k) => k % 9 === 5)
    .flatMap((k) => {
      const [x, y, z] = point(k / count, radius + 0.12);
      return zapfen([x, y - 0.2, z]);
    });
  return [...green, ...lights, ...cones];
}

/** Kranz, aufrecht (Vorderseite +z), unten bei `at`: Ring aus Zweigen, Schleife unten, rote Beeren. */
function kranz(at: Vec, radius: number): ModelPart[] {
  const [x, y, z] = at;
  const cy = y + radius + 0.12;
  const count = 14;
  const ring = range(0, count - 1).map((k) => {
    const a = (k / count) * 2 * Math.PI;
    return branch([x + Math.cos(a) * radius, cy + Math.sin(a) * radius, z], 0.25, 'z', k);
  });
  const berries = [0.9, 2.3, 3.6, 5.1].map((a): ModelPart => ({
    at: [x + Math.cos(a) * radius, cy + Math.sin(a) * radius, z + 0.13],
    block: 'red_concrete',
    scale: [0.09, 0.09, 0.09],
  }));
  return [...ring, ...berries, ...schleife([x, cy - radius + 0.22, z + 0.14], 0.7)];
}

/** Kleiner Christbaum im Kübel: Kübel und ein Tannenbusch als Blöcke, darüber die Spitze als Anzeigen. */
function baeumchen(w: Canvas, x: number, z: number, k: number): string[] {
  w.set(x, GROUND + 1, z, 'barrel[facing=up]');
  w.set(x, GROUND + 2, z, LEAVES);
  w.set(x, GROUND + 3, z, 'snow[layers=1]');
  const cx = x + HALF;
  const cz = z + HALF;
  const base = GROUND + 3 + 0.125;
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
    ...branch([cx + dx * 1.08, GROUND + 2.5 + (i % 2) * 0.08, cz + dz * 1.08], 0.36, 'y', i),
    rotation: aroundY(0),
  }));
  const tiers: ModelPart[] = [
    [0.95, 0.24],
    [0.75, 0.58],
    [0.55, 0.88],
    [0.36, 1.14],
    [0.2, 1.34],
  ].flatMap(([s = 0, dy = 0], i) => [
    { at: [cx, base + dy, cz], ...GREEN, scale: [s, s * 0.62, s], rotation: aroundY(Math.PI / 4) },
    {
      at: [cx, base + dy + 0.04, cz],
      ...GREEN,
      scale: [s * 0.85, s * 0.6, s * 0.85],
      rotation: aroundY(i * 0.4),
    },
  ]);
  const lights = range(0, 7).map((i) => {
    const a = i * 2.4 + k;
    const level = (i % 4) * 0.27 + 0.2;
    const r = 0.46 - level * 0.28;
    return bulb([cx + Math.cos(a) * r, base + level, cz + Math.sin(a) * r], i);
  });
  const top = placeModel(tags(KIND), [cx, base + 1.62, cz], 0, stern(0.5));
  const balls = [0, 2.1, 4.2].map((a, i) =>
    kugel([cx + Math.cos(a + k) * 0.36, base + 0.42 + i * 0.08, cz + Math.sin(a + k) * 0.36], 0.17, i + k),
  );
  return [...placeModel(tags(KIND), [0, 0, 0], 0, [...skirt, ...tiers, ...lights]), ...top, ...balls];
}

/** Das ganze Weihnachtstor: Blöcke in `w`, Anzeige-Wesen als Befehle. */
export function weihnachtstor(w: Canvas, tor: Tor): string[] {
  const { x1, x2, z, height } = tor;
  const beam = GROUND + height;
  // Echte Blöcke: Pfosten, Balken, eine Reihe Fichtenlaub mit Schnee darauf, Laternen auf den Enden.
  [x1, x2].forEach((x) => range(GROUND + 1, beam - 1).forEach((y) => w.set(x, y, z, 'spruce_log')));
  range(x1, x2).forEach((x) => {
    w.set(x, beam, z, 'stripped_spruce_log[axis=x]');
    w.set(x, beam + 1, z, LEAVES);
    w.set(x, beam + 2, z, x === x1 || x === x2 ? 'lantern' : 'snow[layers=1]');
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
    ...straight(left - 0.15, right + 0.15, gy, front + out, 1),
    ...straight(left - 0.15, right + 0.15, gy, back - out, -1),
  ];
  // Vier Bögen vorne, zwischen Schleifen an den Pfosten und auf dem Balken
  const hooks = range(0, 4).map((i) => left + HALF + ((right - left - 1) * i) / 4);
  const swagZ = front + BRANCH * 0.86 * REACH + 0.02;
  const swags = hooks.slice(1).flatMap((hx, i) => {
    const prev = hooks[i] ?? left;
    return swag([prev, beam + 0.66, swagZ], [hx, beam + 0.66, swagZ], 0.82);
  });
  const bows = hooks.flatMap((hx) => schleife([hx, beam + 0.72, swagZ + 0.32], 1.25));
  const balls = hooks.slice(1).map((hx, i) => {
    const prev = hooks[i] ?? left;
    return kugel([(prev + hx) / 2, beam + 0.66 - 0.82 - 0.36, swagZ], 0.3, i);
  });
  // Um die Pfosten gewunden (oben unter dem Balken bis knapp über den Schnee)
  const spirals = [
    ...spiral(x1 + HALF, z + HALF, beam - 0.32, GROUND + 2.1, Math.PI / 2),
    ...spiral(x2 + HALF, z + HALF, beam - 0.32, GROUND + 2.1, Math.PI / 2),
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
    textSign(
      tags(KIND),
      [middle, textY, boardZ + thick / 2 + 0.03],
      0,
      [
        { text: '✦ Weihnachtsmarkt ✦\\n', color: 'gold', bold: true },
        { text: 'Christmas Market', color: 'white' },
      ],
      1.45,
    ),
    textSign(
      tags(KIND),
      [middle, textY, boardZ - thick / 2 - 0.03],
      180,
      [
        { text: '✦ Frohe Weihnachten! ✦\\n', color: 'gold', bold: true },
        { text: 'Merry Christmas', color: 'white' },
      ],
      1.3,
    ),
  ];
  const star = placeModel(tags(KIND), [middle, boardY + boardH + 0.62, boardZ], 0, stern(1.5));
  // Kränze links und rechts vom Schild, auf dem Schnee über dem Laub
  const wreaths = [middle - boardW / 2 - 1.05, middle + boardW / 2 + 1.05].flatMap((x) =>
    kranz([x, beam + 2, boardZ], 0.4),
  );
  const trees = [...baeumchen(w, x1 - 1, z + 2, 0), ...baeumchen(w, x2 + 1, z + 2, 1)];
  return [
    ...placeModel(tags(KIND), [0, 0, 0], 0, [
      ...garlands,
      ...swags,
      ...bows,
      ...spirals,
      ...board,
      ...wreaths,
    ]),
    ...balls,
    ...star,
    ...signs,
    ...trees,
  ];
}
