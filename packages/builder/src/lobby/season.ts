/* eslint-disable ts-patterns/no-magic-numbers -- a decoration plan: positions, sizes and colours as the lobby needs them */
/**
 * Saison-Deko der Lobby (Panel: Lobby → Saison-Deko): Wiesn, Winter, Ostern, Halloween. Die Deko sind Anzeige-Wesen
 * (block_display/text_display) mit dem Tag `mm_season` + `mm_season_<name>` – Umschalten = alte weg, neue hin; das
 * Lobby-Plugin räumt Deko einer anderen Saison weg, sobald sie geladen wird.
 * Wiesn, Winter und Ostern setzen dazu Blöcke (`wiesn.ts`, `winter.ts`, `ostern.ts`: Karussell, Riesenrad, Schnee,
 * Christbaum, Osterbrunnen, Blüten …); jede andere Saison stellt sie über `<saison>/off_…` genau wieder her (datapack.ts).
 */
import type { Canvas } from '../canvas.js';
import { GROUND } from '../nature.js';
import { worldOf, type World } from '../pruefung.js';
import { buildLobby } from './dorfplatz.js';
import { blockDisplay, multiply, type Quat, type Vec } from './deko.js';
import { anchorEnd, settle } from './halt.js';
import { pointAt, stallFrame, STALLS as MARKT_STAENDE } from './weihnachtsmarkt.js';
import type { SeasonPlan } from './saison-plan.js';
import { osternPlan } from './ostern.js';
import { wiesnPlan } from './wiesn.js';
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

/**
 * Kette zwischen zwei Häusern bzw. vom Maibaum zu den Ständen: beide Enden rücken entlang der Kette an den nächsten
 * Block (Hauswand, Dach, Markise). Findet ein Ende keinen, hängt die Kette nicht.
 */
function hung(
  w: World,
  season: Season,
  a: Vec,
  b: Vec,
  sag: number,
  colours: readonly string[],
  lights: boolean,
  reach = 6,
): string[] {
  const a2 = anchorEnd(w, a, b, reach, reach);
  const b2 = a2 && anchorEnd(w, b, a2, reach, reach);
  return a2 && b2 ? chain(season, a2, b2, sag, colours, lights) : [];
}

/** Ketten über Dorfstraße, Handwerkergasse und vom Maibaum zu den Marktständen. */
function chains(w: World, season: Season, colours: readonly string[], lights = false): string[] {
  const y = GROUND + 6;
  const street = [30, 44, 58, 72, 86, 100].flatMap((z) =>
    hung(w, season, [-7, y, z + HALF], [8, y, z + HALF], 0.8, colours, lights),
  );
  const lane = [-55, -69, -83, -97, -111].flatMap((x) =>
    hung(w, season, [x + HALF, y, 0], [x + HALF, y, 15], 0.8, colours, lights),
  );
  const radial = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return hung(
      w,
      season,
      [HALF, GROUND + 22, HALF],
      [HALF + Math.cos(angle) * 21, GROUND + 5, HALF + Math.sin(angle) * 21],
      1.6,
      colours,
      lights,
      12,
    );
  }).flat();
  return [...street, ...lane, ...radial];
}

/** Punkt vor einem Marktstand (Dorfmarkt und Schlossmarkt) in Rahmen-Koordinaten des Stands (siehe `pointAt`). */
const atStalls = (u: number, y: number, v: number): Vec[] =>
  MARKT_STAENDE.map((stall) => pointAt(stallFrame(stall), u, y, v));

/** Haustüren an der Dorfstraße (davor kommt Deko). */
const DOORS: readonly Vec[] = [32, 50, 68, 86].flatMap((z) => [
  [-8.5, GROUND + 1, z + HALF] as Vec,
  [9.5, GROUND + 1, z + 6 + HALF] as Vec,
]);

const HALLOWEEN: readonly string[] = ['orange_wool', 'purple_wool', 'black_wool'];

/**
 * Winter-Wunderland: alles aus dem Winter-Plan (Dächer, Baum, Stände, Lichterketten vom Maibaum …). Die Ketten quer
 * über Dorfstraße und Gasse hängen im Winter nicht – ihre Enden schwebten frei vor den Häusern; dort leuchten jetzt
 * die Lichter an den Giebeln.
 */
function winter(plan: WinterPlan): string[] {
  return [...plan.displays, ...plan.moves];
}

function halloween(w: World): string[] {
  const s: Season = 'halloween';
  /** Kürbis auf dem Boden (neben der Tür, vor dem Stand) – auf dem nächsten freien Fleck. */
  const pumpkin = (at: Vec, block: string, size: number, facing: string): string[] =>
    settle(
      w,
      [at[0], GROUND + 1 + size / 2, at[2]],
      (p) => [
        display(s, p, block, {
          scale: [size, size, size],
          properties: { facing },
          glow: block === 'jack_o_lantern',
        }),
      ],
      2,
    ) ?? [];
  const pumpkins = DOORS.flatMap(([x, y, z]) => [
    ...pumpkin([x, y, z - 1.3], 'jack_o_lantern', 0.7, 'east'),
    ...pumpkin([x, y, z + 1.3], 'carved_pumpkin', 0.6, 'east'),
  ]);
  const stalls = atStalls(0.6, 0, -1.6).flatMap((at) => pumpkin(at, 'jack_o_lantern', 0.6, 'south'));
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
  // Spinnweben in Hausecken: an der nächsten Wand
  const webs = webSpots.flatMap(
    (at) => settle(w, at, (p) => [display(s, p, 'cobweb', { scale: [1, 1, 1] })], 3) ?? [],
  );
  return [...chains(w, s, HALLOWEEN), ...pumpkins, ...stalls, ...graves, ...webs];
}

/** Saisons mit Bauten (Blöcke, die die Saison setzt und jede andere genau wieder wegräumt). */
const BUILT: Readonly<Partial<Record<Season, (base: Canvas) => SeasonPlan>>> = {
  wiesn: wiesnPlan,
  winter: winterPlan,
  easter: osternPlan,
};

/** Bauplan einer Saison mit Bauten – null, wenn sie nur Anzeigen hat (oder keine Saison). */
export function seasonPlan(season: Season, base: Canvas): SeasonPlan | null {
  return BUILT[season]?.(base) ?? null;
}

/** Alle Saisons mit Bauten und ihre Pläne. */
export function seasonPlans(base: Canvas): Partial<Record<Season, SeasonPlan>> {
  return Object.fromEntries(
    SEASONS.flatMap((season) => {
      const plan = seasonPlan(season, base);
      return plan ? [[season, plan] as const] : [];
    }),
  );
}

const PLANS: Readonly<Record<Season, (lobby: () => Canvas) => string[]>> = {
  none: () => [],
  wiesn: (lobby) => {
    const plan = wiesnPlan(lobby());
    return [...plan.displays, ...plan.moves];
  },
  winter: (lobby) => winter(winterPlan(lobby())),
  easter: (lobby) => {
    const plan = osternPlan(lobby());
    return [...plan.displays, ...plan.moves];
  },
  halloween: (lobby) => halloween(worldOf(lobby())),
};

/**
 * Anzeige-Wesen einer Saison: erst alles Alte weg (soweit geladen), dann die neue Deko. Die Deko sucht sich ihren Platz
 * im Bauplan der Lobby (Dächer, Wände, Stände, Boden); ohne wird er hier gebaut.
 */
export function seasonCommands(season: Season, lobby?: Canvas): string[] {
  const cache: { canvas?: Canvas } = {};
  const canvas = (): Canvas => {
    cache.canvas ??= lobby ?? buildLobby().canvas;
    return cache.canvas;
  };
  return ['kill @e[tag=mm_season]', ...PLANS[season](canvas)];
}
