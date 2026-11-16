/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: positions in the lobby as the world has them */
/**
 * Schlosstreppe: vom Schlossmarkt zu Fuß hinauf zum Schloss – ein Prunkaufgang. Unten das **Prunkportal**: zwei
 * Säulenpaare mit goldenen Kapitellen, Rundbogen mit Schlussstein, das Wappen auf der Attika, Fahnen auf den Pfeilern,
 * Banner in den Nischen, ein Kronleuchter im Bogen. Der **rote Teppich** beginnt am Dorfplatz, läuft durch den
 * Marktbogen, über die Stufen (Läufer aus rotem Netherziegel, Teppich geht auf Treppen nicht) und den Schlossvorplatz
 * bis durchs Schlosstor. Vier Läufe mit 26 Stufen aus weißem Marmor und drei Podesten mit goldener Borte folgen dem
 * Schlossberg; Wangen aus Marmor mit einer Blütenhecke als Geländer, alle paar Stufen ein Pfosten mit Laterne, an den
 * Podesten Goldkugeln, Blumenkübel und Fahnenmasten. Oben der **Schlossvorplatz** in hellem Stein mit Blumenbeeten,
 * Fahnenallee, Lichter- und Wimpelketten über dem Platz, Laternen und zwei Linden. Nachts leuchten die Laternen,
 * unsichtbares Licht strahlt Portal, Fahnen und Stufen an.
 * Die Launchpads schießen weiter über die Treppe – ihre Flugbahn bleibt frei (Test).
 */
import type { Canvas } from '../canvas.js';
import { flagpole, FLAG_GOLD, FLAG_SMARAGD, FLAG_WEISSBLAU, banner, wappen, type Flag } from '../fahnen.js';
import { GROUND, roundTree } from '../nature.js';
import { pick, random } from '../noise.js';
import { range } from '../range.js';
import { stairs } from '../shapes.js';
import { signText } from '../village.js';
import { lampPost } from './common.js';

/** Ein Lauf: so viele Stufen, danach ein Podest dieser Länge (der letzte endet am Vorplatz). */
const RUNS: readonly (readonly [steps: number, landing: number])[] = [
  [6, 3],
  [7, 3],
  [7, 3],
  [6, 0],
];
/** Die erste Stufe (Süden, am Schlossmarkt); die Treppe steigt nach Norden. */
const FIRST_Z = -34;
/** Stufen von x −5 bis 5, Wangen bei ±6. */
const HALF = 5;
const WALL = 6;
/** Bis hierher (Süden) liegt der Schlossmarkt eben auf Höhe 64. */
const PLAZA_EDGE = -38;
/** Schlossvorplatz zwischen Treppe und Schlosstor (die Bastei beginnt bei z −96). */
export const VORPLATZ = { x1: -12, x2: 12, z1: -95, z2: -69, y: 90 } as const;
/** Der rote Teppich: x −2 … 2, daneben die goldene Borte. */
export const RUNNER_HALF = 2;
const TRIM = RUNNER_HALF + 1;
/** Hier beginnt der Teppich (Rand des Dorfplatzes). */
export const CARPET_FROM_Z = -23;
/** Prunkportal: hinten an der ersten Stufe, vorne zum Markt. */
export const PORTAL_Z = FIRST_Z + 1;
/** Die Pfeiler des Portals reichen bis hierher zur Seite (die Launchpad-Flugbahn liegt weiter außen). */
export const PORTAL_HALF = 8;

const MARBLE = 'smooth_quartz';
const RUNNER = 'red_nether_brick';
const CARPET = 'red_carpet';
/** Geländer: Blütenhecke auf den Wangen. */
const GARLAND = 'flowering_azalea_leaves[persistent=true]';
/** Alle so viele Stufen ein Pfosten mit Laterne auf der Wange. */
const POST_EVERY = 3;
/** Fahnenmasten neben den Podesten stehen so weit außen (die Flugbahn der Launchpads bleibt innen frei). */
const FLAG_X = 9;
/** Unsichtbares Licht über den Stufen und vor dem Portal (nachts hell, bei Tag unsichtbar). */
const GLOW = 'light[level=13]';
const FLOOD = 'light[level=15]';

/** Eine Reihe der Treppe: z, Füße auf Höhe y, Stufe oder Podest (dann mit Nummer). */
export interface StairRow {
  readonly z: number;
  readonly y: number;
  readonly landing?: number;
}

/** Die Treppe Reihe für Reihe, von unten (Schlossmarkt, Füße auf 65) bis oben (Füße auf Höhe des Vorplatzes). */
export const SCHLOSSTREPPE: readonly StairRow[] = RUNS.reduce<StairRow[]>((rows, [steps, landing], run) => {
  const last = rows[rows.length - 1] ?? { z: FIRST_Z + 1, y: GROUND + 1 };
  const flight = range(1, steps).map((k): StairRow => ({ z: last.z - k, y: last.y + k }));
  const top = flight[flight.length - 1] ?? last;
  const rest =
    landing > 0 ? range(1, landing).map((k): StairRow => ({ z: top.z - k, y: top.y, landing: run + 1 })) : [];
  return [...rows, ...flight, ...rest];
}, []);

const BED_FLOWERS = ['cornflower', 'white_tulip', 'cornflower', 'azure_bluet', 'red_tulip', 'oxeye_daisy'];
const SLOPE_FLOWERS = ['poppy', 'cornflower', 'oxeye_daisy', 'allium', 'red_tulip', 'azure_bluet'];
/** Wimpel der Ketten über dem Vorplatz. */
const PENNANTS = ['lime', 'yellow', 'white', 'light_blue'];

/** Ketten über dem Vorplatz (zwischen den Fahnenmasten am Rand). */
const GARLAND_Z = [-77, -84, -91];

/** Stern aus Gold und Smaragd in der Mitte des Teppichs. */
const STAR_Z = -82;
const inStar = (x: number, z: number): boolean => Math.abs(x) + Math.abs(z - STAR_Z) <= 1;

/** Linke Seite Smaragd, rechte Weiß-Blau (wie am Schlosstor). */
const flagOf = (side: number): Flag => (side < 0 ? FLAG_SMARAGD : FLAG_WEISSBLAU);

export function buildSchlosstreppe(c: Canvas, height: (x: number, z: number) => number): void {
  const rnd = random(1912);
  const outside = (x: number, z: number): number => (z >= PLAZA_EDGE ? GROUND : Math.round(height(x, z)));
  // Pfosten am Fuß, oben und an beiden Enden jedes Podests
  const ends = new Set(
    SCHLOSSTREPPE.filter((row, i) => {
      const prev = SCHLOSSTREPPE[i - 1];
      const next = SCHLOSSTREPPE[i + 1];
      const landingEnd =
        row.landing !== undefined && (row.landing !== prev?.landing || row.landing !== next?.landing);
      return i === 0 || !next || landingEnd;
    }).map((row) => row.z),
  );
  SCHLOSSTREPPE.forEach((row, i) => {
    const top = row.y - 1;
    range(-HALF, HALF).forEach((x) => {
      const ground = Math.min(outside(x, row.z), top) - 2;
      range(Math.max(GROUND, ground), top - 1).forEach((y) => c.set(x, y, row.z, 'stone_bricks'));
      range(row.y, row.y + 6).forEach((y) => c.set(x, y, row.z, 'air'));
      const onRunner = Math.abs(x) <= RUNNER_HALF;
      if (row.landing === undefined) c.set(x, top, row.z, stairs(onRunner ? RUNNER : MARBLE, 'north'));
      else {
        c.set(x, top, row.z, landingTile(x));
        if (onRunner) c.set(x, row.y, row.z, CARPET);
      }
    });
    // Wangen aus Marmor; darauf die Blütenhecke, alle paar Stufen ein Pfosten mit Laterne, an den Podesten Goldkugeln
    [-WALL, WALL].forEach((x) => {
      const out = outside(x, row.z);
      const wallTop = Math.max(top, out);
      const bottom = Math.min(top, out) - 1;
      range(bottom, wallTop).forEach((y) => c.set(x, y, row.z, y === bottom ? 'quartz_bricks' : MARBLE));
      range(wallTop + 1, wallTop + 6).forEach((y) => c.set(x, y, row.z, 'air'));
      if (ends.has(row.z)) {
        c.set(x, wallTop + 1, row.z, 'chiseled_quartz_block');
        c.set(x, wallTop + 2, row.z, 'gold_block');
        c.set(x, wallTop + 3, row.z, 'lantern');
      } else if (i % POST_EVERY === 0) {
        c.set(x, wallTop + 1, row.z, 'quartz_pillar');
        c.set(x, wallTop + 2, row.z, 'lantern');
      } else c.set(x, wallTop + 1, row.z, GARLAND);
      // Blumen am Hang neben der Treppe
      if (row.z < PLAZA_EDGE - 1)
        [x + Math.sign(x), x + 2 * Math.sign(x)].forEach((fx) => {
          const h = outside(fx, row.z);
          c.set(fx, h, row.z, 'grass_block');
          c.set(fx, h + 1, row.z, pick(rnd, SLOPE_FLOWERS));
        });
    });
    // Blumenkübel an den Enden jedes Podests, an die Wange gerückt
    if (row.landing !== undefined && ends.has(row.z))
      [-HALF, HALF].forEach((x) => {
        c.set(x, row.y, row.z, 'composter[level=8]');
        c.set(x, row.y + 1, row.z, 'flowering_azalea');
      });
    // Über den Stufen etwas Licht für die Nacht
    if (i % 4 === 2) [-3, 3].forEach((x) => c.soft(x, row.y + 4, row.z, GLOW));
  });
  RUNS.forEach((_, run) => {
    const rows = SCHLOSSTREPPE.filter((row) => row.landing === run + 1);
    const [first, last] = [rows[0], rows[rows.length - 1]];
    const middle = rows[Math.floor(rows.length / 2)];
    if (first && last)
      c.place(`Schlosstreppe: Podest ${run + 1}`, -HALF + 1, first.y, first.z, HALF - 1, last.z);
    // Fahnenmasten neben jedem Podest (am Hang, außen neben der Wange)
    if (middle)
      [-FLAG_X, FLAG_X].forEach((x) => {
        const ground = Math.round(height(x, middle.z));
        const base = Math.max(ground, middle.y - 1);
        if (base > ground) range(ground + 1, base).forEach((y) => c.set(x, y, middle.z, 'quartz_bricks'));
        flagpole(c, x, base, middle.z, 5, flagOf(x));
      });
  });
  marketCarpet(c);
  portal(c);
  vorplatz(c, height, rnd);
}

/** Muster der Podeste: Marmor, in der Mitte der Teppich, daneben die goldene Borte, am Rand Quarzziegel. */
function landingTile(x: number): string {
  if (Math.abs(x) === HALF) return 'quartz_bricks';
  if (Math.abs(x) === TRIM) return 'gold_block';
  return MARBLE;
}

/** Roter Teppich vom Dorfplatz durch den Marktbogen bis ans Portal, mit goldener Borte im Pflaster. */
function marketCarpet(c: Canvas): void {
  range(PORTAL_Z + 2, CARPET_FROM_Z).forEach((z) => {
    range(-RUNNER_HALF, RUNNER_HALF).forEach((x) => c.set(x, GROUND + 1, z, CARPET));
    [-TRIM, TRIM].forEach((x) => c.set(x, GROUND, z, 'gold_block'));
  });
}

/**
 * Prunkportal am Fuß der Treppe: je Seite ein Pfeiler mit zwei Säulen (goldene Kapitelle) und einer Nische mit
 * Banner, dazwischen ein Rundbogen mit Schlussstein und Kronleuchter, darüber das Gebälk mit der Inschrift und eine
 * Attika mit dem Wappen; Fahnen auf den Pfeilern, Laternen an den Ecken, Blumenkübel davor, nachts angestrahlt.
 */
function portal(c: Canvas): void {
  const back = PORTAL_Z;
  const front = PORTAL_Z + 1;
  const y = GROUND + 1;
  const depth = [back, front];
  // Durchgang: Marmorboden, Teppich mit goldener Borte, darüber frei
  range(-HALF, HALF).forEach((x) =>
    depth.forEach((z) => {
      c.set(x, GROUND, z, Math.abs(x) === TRIM ? 'gold_block' : MARBLE);
      range(y, y + 7).forEach((py) => c.set(x, py, z, 'air'));
      if (Math.abs(x) <= RUNNER_HALF) c.set(x, y, z, CARPET);
    }),
  );
  [-1, 1].forEach((side) => {
    const flag = flagOf(side);
    const xs = range(WALL, PORTAL_HALF).map((a) => side * a);
    xs.forEach((x) =>
      depth.forEach((z) => {
        c.set(x, GROUND, z, MARBLE);
        c.set(x, y, z, 'chiseled_quartz_block');
        range(y + 1, y + 6).forEach((py) => c.set(x, py, z, z === back ? MARBLE : 'air'));
        c.set(x, y + 7, z, 'chiseled_quartz_block');
        c.set(x, y + 8, z, MARBLE);
      }),
    );
    // Säulen vorne mit goldenem Kapitell, dazwischen die Nische mit Banner und Blumentopf
    [WALL, PORTAL_HALF].forEach((a) => {
      range(y + 1, y + 5).forEach((py) => c.set(side * a, py, front, 'quartz_pillar'));
      c.set(side * a, y + 6, front, 'gold_block');
    });
    const niche = side * (WALL + 1);
    c.set(niche, y + 6, front, MARBLE);
    c.set(niche, y + 5, front, banner(flag.colour, 'south', flag.patterns));
    c.set(niche, y + 1, front, 'potted_flowering_azalea_bush');
    // Oben auf dem Pfeiler: Fahne, an den Ecken Laternen
    flagpole(c, niche, y + 9, back, 5, flag);
    c.set(niche, y + 9, front, 'gold_block');
    [WALL, PORTAL_HALF].forEach((a) => c.set(side * a, y + 9, front, 'lantern'));
    // Blumenkübel vor dem Portal und in der Ecke zwischen Wange und Stützmauer
    [
      [PORTAL_HALF + 2, front + 1],
      [WALL + 3, FIRST_Z - 2],
    ].forEach(([a = 0, z = 0]) => {
      c.set(side * a, y, z, 'quartz_bricks');
      c.set(side * a, y + 1, z, 'potted_flowering_azalea_bush');
    });
  });
  // Rundbogen: aus umgedrehten Marmortreppen, oben flach mit Schlussstein
  const arch: readonly (readonly [number, number])[] = [
    [5, 4],
    [4, 5],
    [3, 6],
  ];
  depth.forEach((z) => {
    arch.forEach(([a, from]) =>
      [-1, 1].forEach((side) => {
        c.set(side * a, y + from, z, stairs('quartz', side < 0 ? 'west' : 'east', 'top'));
        range(y + from + 1, y + 7).forEach((py) => c.set(side * a, py, z, MARBLE));
      }),
    );
    range(-2, 2).forEach((x) =>
      c.set(x, y + 7, z, x === 0 ? 'chiseled_quartz_block' : 'smooth_quartz_slab[type=top]'),
    );
  });
  // Gebälk über der ganzen Breite
  range(-PORTAL_HALF, PORTAL_HALF).forEach((x) => depth.forEach((z) => c.set(x, y + 8, z, MARBLE)));
  // Attika mit Wappen (vorne), oben eine Kante
  range(-4, 4).forEach((x) => {
    range(y + 9, y + 15).forEach((py) => {
      c.set(x, py, back, MARBLE);
      if (Math.abs(x) === 4) c.set(x, py, front, MARBLE);
    });
    depth.forEach((z) => c.set(x, y + 16, z, 'smooth_quartz_slab[type=bottom]'));
  });
  wappen((x, row, block) => c.set(x, y + 15 - row, front, block));
  // Kronleuchter im Bogen: Kette, goldene Mitte, vier Laternen an kurzen Armen
  c.set(0, y + 6, back, 'iron_chain[axis=y]');
  c.set(0, y + 5, back, 'gold_block');
  [
    [-1, back, 'iron_chain[axis=x]'],
    [1, back, 'iron_chain[axis=x]'],
    [0, front, 'iron_chain[axis=z]'],
    [0, back - 1, 'iron_chain[axis=z]'],
  ].forEach(([x = 0, z = 0, arm = '']) => {
    c.set(Number(x), y + 5, Number(z), String(arm));
    c.set(Number(x), y + 4, Number(z), 'lantern[hanging=true]');
  });
  // Inschrift am Gebälk
  signText(
    c,
    0.5,
    y + 8.08,
    front + 1.02,
    'south',
    [
      { text: '♛ Zum Schloss ♛\n', color: 'gold', bold: true },
      { text: 'Festsaal · Bibliothek · Rittersaal · To the castle', color: 'white' },
    ],
    0.8,
  );
  signText(
    c,
    0.5,
    y + 8.08,
    back - 0.02,
    'north',
    [
      { text: '↓ Schlossmarkt & Dorfplatz\n', color: 'gold', bold: true },
      { text: 'To the market', color: 'gray', italic: true },
    ],
    0.8,
  );
  // Nachts angestrahlt
  [-PORTAL_HALF + 1, 0, PORTAL_HALF - 1].forEach((x) =>
    [y + 3, y + 8, y + 13].forEach((py) => c.soft(x, py, front + 3, FLOOD)),
  );
  c.place('Schlosstreppe: Portal', -HALF + 1, y, back, HALF - 1, front);
}

/**
 * Schlossvorplatz: heller Stein, der rote Teppich mit Goldborte und einem Stern aus Gold und Smaragd darin,
 * Blumenbeete, Fahnenallee mit Lichter- und Wimpelketten über dem Platz, Laternen, zwei Linden, zwei hohe Fahnen am
 * Kopf der Treppe.
 */
function vorplatz(c: Canvas, height: (x: number, z: number) => number, rnd: () => number): void {
  const { x1, x2, z1, z2, y } = VORPLATZ;
  range(x1, x2).forEach((x) =>
    range(z1, z2).forEach((z) => {
      const ground = Math.round(height(x, z));
      range(Math.min(ground, y) - 1, y - 1).forEach((fy) => c.set(x, fy, z, 'stone_bricks'));
      range(y + 1, y + 7).forEach((fy) => c.set(x, fy, z, 'air'));
      c.set(x, y, z, plazaTile(x, z));
      if (Math.abs(x) <= RUNNER_HALF && !inStar(x, z)) c.set(x, y + 1, z, CARPET);
      const bed = Math.abs(x) >= 5 && Math.abs(x) <= 10 && z <= z2 - 4 && z >= z1 + 4;
      if (bed) {
        c.set(x, y, z, 'grass_block');
        c.set(x, y + 1, z, BED_FLOWERS[Math.abs(x + z) % BED_FLOWERS.length] ?? 'cornflower');
      }
      // Brüstung, wo der Platz über dem Hang liegt (nicht vor der Treppe)
      const side = Math.abs(x) === x2;
      const front = z === z2 && Math.abs(x) > WALL;
      const below = (dx: number, dz: number): boolean => Math.round(height(x + dx, z + dz)) < y;
      if ((side && below(Math.sign(x), 0)) || (front && below(0, 1))) c.set(x, y + 1, z, railAt(side, front));
    }),
  );
  // Formschnitt an den Ecken der Beete
  [-1, 1].forEach((side) =>
    [5, 10].forEach((ax) =>
      [z2 - 4, z1 + 4].forEach((z) => {
        c.set(side * ax, y + 1, z, 'flowering_azalea_leaves[persistent=true]');
        c.set(side * ax, y + 2, z, 'azalea_leaves[persistent=true]');
      }),
    ),
  );
  // Laternen am Mittelweg, Linden an der Treppe, zwei hohe Fahnen am Kopf der Treppe
  [-4, 4].forEach((x) => [-73, -80, -87, -93].forEach((z) => lampPost(c, x, y, z)));
  [-11, 11].forEach((x) => {
    c.set(x, y, z2 - 2, 'grass_block');
    roundTree(c, x, y + 1, z2 - 2, { height: 9, radius: 3.2, leaves: 'oak_leaves', rnd });
  });
  [-WALL, WALL].forEach((x) => flagpole(c, x, y, z2 - 1, 7, flagOf(x)));
  // Fahnenallee am Rand, dazwischen Ketten mit Laternen und Wimpeln über den ganzen Platz
  GARLAND_Z.forEach((z, row) => {
    [-11, 11].forEach((x) => flagpole(c, x, y, z, 6, row === 1 ? FLAG_GOLD : flagOf(x)));
    range(-10, 10).forEach((x) => {
      c.set(x, y + 6, z, 'iron_chain[axis=x]');
      if (x % 3 === 0) c.set(x, y + 5, z, 'lantern[hanging=true]');
      else if (Math.abs(x) % 3 === 1) {
        const colour = PENNANTS[(x + 10 + row) % PENNANTS.length] ?? 'white';
        c.set(x, y + 5, z, `${colour}_wall_banner[facing=${row % 2 === 0 ? 'south' : 'north'}]`);
      }
    });
  });
  c.place('Schlossvorplatz', x1, y + 1, z1, x2, z2);
}

/** Brüstung am Rand des Vorplatzes: helle Mauer entlang der Kante, an der Ecke ein Pfosten. */
function railAt(side: boolean, front: boolean): string {
  if (side && front) return 'diorite_wall[up=true]';
  return side ? 'diorite_wall[north=low,south=low,up=false]' : 'diorite_wall[east=low,west=low,up=false]';
}

/** Pflaster des Vorplatzes: Rand Andesit, Teppich mit Goldborte, Stern, sonst helles Schachbrett. */
function plazaTile(x: number, z: number): string {
  const { x2, z1, z2 } = VORPLATZ;
  if (Math.abs(x) === x2 || z === z1 || z === z2) return 'polished_andesite';
  const star = Math.abs(x) + Math.abs(z - STAR_Z);
  if (star === 0) return 'emerald_block';
  if (star === 1) return 'gold_block';
  if (Math.abs(x) <= RUNNER_HALF) return MARBLE;
  if (Math.abs(x) === TRIM) return 'gold_block';
  if (Math.abs(x) === TRIM + 1) return 'polished_andesite';
  return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 === 0 ? 'polished_diorite' : 'smooth_stone';
}
