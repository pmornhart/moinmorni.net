/* eslint-disable ts-patterns/no-magic-numbers -- a decoration plan: positions, sizes and colours as the lobby needs them */
/**
 * Saison-Deko der Lobby (Panel: Lobby → Saison-Deko): Wiesn, Winter, Ostern, Halloween. Die Deko sind Anzeige-Wesen
 * (block_display/text_display) mit dem Tag `mm_season` + `mm_season_<name>` – Umschalten = alte weg, neue hin; das
 * Lobby-Plugin räumt Deko einer anderen Saison weg, sobald sie geladen wird.
 * Der Winter setzt dazu Blöcke (Schnee, Eis, Christbaum, Eisbahn – `winter.ts`); jede Saison stellt sie über
 * `winter/off_…` genau wieder her (datapack.ts).
 */
import type { Canvas } from '../canvas.js';
import { GROUND } from '../nature.js';
import { random } from '../noise.js';
import { buildLobby } from './dorfplatz.js';
import { blockDisplay, multiply, type Quat, type Vec } from './deko.js';
import { winterPlan, type WinterPlan } from './winter.js';

export const SEASONS = ['none', 'wiesn', 'winter', 'easter', 'halloween'] as const;
export type Season = (typeof SEASONS)[number];

const HALF = 0.5;
const FLAG_SPACING = 0.9;
const FLAG_SIZE = 0.42;
const FLAG_DEPTH = 0.04;
const LIGHT_SIZE = 0.22;
/** 45° um die Blickachse: aus dem Quadrat wird eine Raute. */
const DIAMOND: Quat = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)];

/** Drehung um die Hochachse, so dass die Fläche quer zur Richtung (dx, dz) steht. */
function turnAlong(dx: number, dz: number): Quat {
  const angle = Math.atan2(dx, dz) + Math.PI / 2;
  return [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
}

/** Zahl für Koordinaten (ohne f). */
const c = (n: number): string => `${Number(n.toFixed(4))}`;
const f = (n: number): string => `${Number(n.toFixed(4))}f`;
const tags = (season: Season): string => `Tags:['mm_season','mm_season_${season}']`;

interface DisplayOptions {
  readonly scale: Vec;
  readonly rotation?: Quat;
  /** Leuchtet unabhängig vom Licht (Lichterketten). */
  readonly glow?: boolean;
  readonly properties?: Readonly<Record<string, string>>;
}

/** Block-Anzeige mit Mitte bei (x, y, z) – gedreht um ihre eigene Mitte. */
function display(season: Season, at: Vec, block: string, o: DisplayOptions): string {
  return blockDisplay(tags(season), at, block, o);
}

/** Wimpel- bzw. Lichterkette von a nach b, mit Durchhang; Wimpel als Rauten quer zur Kette. */
function chain(
  season: Season,
  a: Vec,
  b: Vec,
  sag: number,
  colours: readonly string[],
  lights = false,
): string[] {
  const [ax, ay, az] = a;
  const [bx, by, bz] = b;
  const length = Math.hypot(bx - ax, by - ay, bz - az);
  const count = Math.max(2, Math.floor(length / FLAG_SPACING));
  const turn = multiply(turnAlong(bx - ax, bz - az), DIAMOND);
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    const at: Vec = [ax + (bx - ax) * t, ay + (by - ay) * t - sag * 4 * t * (1 - t), az + (bz - az) * t];
    const colour = colours[i % colours.length] ?? 'white_wool';
    return lights
      ? display(season, at, colour, { scale: [LIGHT_SIZE, LIGHT_SIZE, LIGHT_SIZE], glow: true })
      : display(season, [at[0], at[1] - FLAG_SIZE * HALF, at[2]], colour, {
          scale: [FLAG_SIZE, FLAG_SIZE, FLAG_DEPTH],
          rotation: turn,
        });
  });
}

/** Ketten über Dorfstraße, Handwerkergasse und vom Maibaum zum Rand des Dorfplatzes. */
function chains(season: Season, colours: readonly string[], lights = false): string[] {
  const y = GROUND + 6;
  const street = [30, 44, 58, 72, 86, 100].flatMap((z) =>
    chain(season, [-7, y, z + HALF], [8, y, z + HALF], 0.8, colours, lights),
  );
  const lane = [-55, -69, -83, -97, -111].flatMap((x) =>
    chain(season, [x + HALF, y, 0], [x + HALF, y, 15], 0.8, colours, lights),
  );
  const radial = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return chain(
      season,
      [HALF, GROUND + 22, HALF],
      [HALF + Math.cos(angle) * 21, GROUND + 5, HALF + Math.sin(angle) * 21],
      1.6,
      colours,
      lights,
    );
  }).flat();
  return [...street, ...lane, ...radial];
}

/** Text-Anzeige (für Lebkuchenherzen u. ä.). */
function sign(season: Season, at: Vec, text: string, colour: string, scale: number): string {
  const [x, y, z] = at;
  return (
    `summon text_display ${c(x)} ${c(y)} ${c(z)} {${tags(season)},billboard:'vertical',text:{text:'${text}',color:'${colour}',bold:true},` +
    `background:0,shadow:true,transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],scale:[${f(scale)},${f(scale)},${f(scale)}]}}`
  );
}

/** Marktstände (Mitte vorne) – für Herzen und Kürbisse. */
const STALLS: readonly Vec[] = [
  [-41.5, GROUND + 3.3, -29.5],
  [-23.5, GROUND + 3.3, -29.5],
  [24.5, GROUND + 3.3, -29.5],
  [42.5, GROUND + 3.3, -29.5],
  [-35.5, GROUND + 3.3, -13.5],
  [-35.5, GROUND + 3.3, 0.5],
  [-35.5, GROUND + 3.3, 14.5],
];

/** Haustüren an der Dorfstraße (davor kommt Deko). */
const DOORS: readonly Vec[] = [32, 50, 68, 86].flatMap((z) => [
  [-8.5, GROUND + 1, z + HALF] as Vec,
  [9.5, GROUND + 1, z + 6 + HALF] as Vec,
]);

const WIESN: readonly string[] = ['white_wool', 'light_blue_wool'];
const EASTER: readonly string[] = [
  'pink_wool',
  'yellow_wool',
  'light_blue_wool',
  'lime_wool',
  'magenta_wool',
];
const HALLOWEEN: readonly string[] = ['orange_wool', 'purple_wool', 'black_wool'];
const EGG_COLOURS: readonly string[] = [
  'pink_concrete',
  'yellow_concrete',
  'light_blue_concrete',
  'lime_concrete',
  'magenta_concrete',
  'orange_concrete',
  'cyan_concrete',
];

function wiesn(): string[] {
  const s: Season = 'wiesn';
  const hearts = STALLS.flatMap(([x, y, z]) => [
    sign(s, [x, y - 0.75, z + 0.6], '♥', 'red', 3.6),
    sign(s, [x, y - 0.4, z + 0.65], 'Servus!', 'white', 0.7),
  ]);
  const barrelSpots: readonly Vec[] = [
    [55.5, GROUND + 1.5, -20.5],
    [56.5, GROUND + 1.5, -20.5],
    [56, GROUND + 2.5, -20.5],
    [60.5, GROUND + 1.5, 18.5],
  ];
  const barrels = barrelSpots.map((at) =>
    display(s, at, 'barrel', { scale: [1, 1, 1], properties: { facing: 'south' } }),
  );
  return [...chains(s, WIESN), ...hearts, ...barrels];
}

/**
 * Winter-Wunderland: alles aus dem Winter-Plan (Dächer, Baum, Stände, Lichterketten vom Maibaum …). Die Ketten quer
 * über Dorfstraße und Gasse hängen im Winter nicht – ihre Enden schwebten frei vor den Häusern; dort leuchten jetzt
 * die Lichter an den Giebeln.
 */
function winter(plan: WinterPlan): string[] {
  return [...plan.displays, ...plan.moves];
}

function easter(): string[] {
  const s: Season = 'easter';
  const rnd = random(2026);
  const gardens: readonly (readonly [number, number, number, number])[] = [
    [-24, 26, -16, 92],
    [16, 31, 24, 98],
    [-62, 1, -54, 3],
    [-98, 11, -90, 13],
  ];
  const eggs = gardens.flatMap(([x1, z1, x2, z2]) =>
    Array.from({ length: 8 }, () => {
      const x = x1 + rnd() * (x2 - x1);
      const z = z1 + rnd() * (z2 - z1);
      const colour = EGG_COLOURS[Math.floor(rnd() * EGG_COLOURS.length)] ?? 'pink_concrete';
      return display(s, [x, GROUND + 1.2, z], colour, { scale: [0.3, 0.42, 0.3] });
    }),
  );
  const bigEgg = [
    display(s, [-8.5, GROUND + 2, -8.5], 'light_blue_concrete', { scale: [1.2, 1.7, 1.2] }),
    display(s, [-8.5, GROUND + 2.1, -8.5], 'yellow_concrete', { scale: [1.25, 0.3, 1.25] }),
    display(s, [-8.5, GROUND + 1.6, -8.5], 'pink_concrete', { scale: [1.25, 0.2, 1.25] }),
  ];
  const bunnies = [
    [-20, 40],
    [-20, 58],
    [20, 46],
    [20, 80],
    [-60, 6],
  ].map(
    ([x, z]) =>
      `summon rabbit ${(x ?? 0) + HALF} ${GROUND + 1} ${(z ?? 0) + HALF} {${tags(s)},PersistenceRequired:1b,Invulnerable:1b,RabbitType:${Math.floor(rnd() * 5)}}`,
  );
  return [...chains(s, EASTER), ...eggs, ...bigEgg, ...bunnies];
}

function halloween(): string[] {
  const s: Season = 'halloween';
  const pumpkins = DOORS.flatMap(([x, y, z]) => [
    display(s, [x, y + 0.35, z - 1.3], 'jack_o_lantern', {
      scale: [0.7, 0.7, 0.7],
      properties: { facing: 'east' },
      glow: true,
    }),
    display(s, [x, y + 0.35, z + 1.3], 'carved_pumpkin', {
      scale: [0.6, 0.6, 0.6],
      properties: { facing: 'east' },
    }),
  ]);
  const stalls = STALLS.map(([x, y, z]) =>
    display(s, [x, y - 1.6, z + 0.4], 'jack_o_lantern', {
      scale: [0.6, 0.6, 0.6],
      properties: { facing: 'south' },
      glow: true,
    }),
  );
  const graves = [-11, -8, -5, -2, 1].flatMap((x, i) => [
    display(s, [x + HALF, GROUND + 1.45, 103.5 - (i % 2)], 'mossy_stone_bricks', { scale: [0.7, 0.9, 0.2] }),
    display(s, [x + HALF, GROUND + 1.05, 104.5 - (i % 2)], 'podzol', { scale: [0.8, 0.1, 1.2] }),
  ]);
  const webSpots: readonly Vec[] = [
    [-7.5, GROUND + 5, 24.5],
    [7.5, GROUND + 5, 40.5],
    [-48.5, GROUND + 5, 3.5],
    [-62.5, GROUND + 5, 10.5],
  ];
  const webs = webSpots.map((at) => display(s, at, 'cobweb', { scale: [1, 1, 1] }));
  return [...chains(s, HALLOWEEN), ...pumpkins, ...stalls, ...graves, ...webs];
}

const PLANS: Readonly<Record<Season, (plan: () => WinterPlan) => string[]>> = {
  none: () => [],
  wiesn,
  winter: (plan) => winter(plan()),
  easter,
  halloween,
};

/**
 * Anzeige-Wesen einer Saison: erst alles Alte weg (soweit geladen), dann die neue Deko. Für den Winter braucht es den
 * Bauplan der Lobby (Dächer, Zäune, Stände); ohne wird er hier gebaut.
 */
export function seasonCommands(season: Season, lobby?: Canvas): string[] {
  return ['kill @e[tag=mm_season]', ...PLANS[season](() => winterPlan(lobby ?? buildLobby().canvas))];
}
