/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: block offsets as the build needs them */
/**
 * Entwurf A – „Dorfplatz am Schlossberg“ (von Philip gewählt, ausgebaut): runder Dorfplatz mit Maibaum,
 * Prachtstraße hinauf zum Schloss auf dem Hügel, statt Portalen Marktstände mit Figuren für die Spielmodi (anklicken →
 * Modus), Dorfstraße und Handwerkergasse mit begehbaren, eingerichteten Häusern (Bäckerei, Krämer, Apotheke, Rathaus,
 * Gäste-Info, Schmiede, Schreinerei, Wohnhäuser), Wirtshaus mit Wirt und Stammtisch, Biergarten mit Gästen,
 * Leute im Dorf, Obstgarten, Weide, Felder und Teich, ringsum Alpengipfel mit Schnee.
 */
import { biergarten, castle, chapel, launchpad, maypole } from '../bavaria.js';
import { Canvas } from '../canvas.js';
import { dorfbrunnen } from '../dorfbrunnen.js';
import { fitFurniture } from '../furniture.js';
import { fitConnections } from '../verbindungen.js';
import { fbm, pick, random } from '../noise.js';
import { GROUND, meadow, roundTree, terrain } from '../nature.js';
import { disc, pairs, range } from '../range.js';
import { discAt, path, stairs, STEP, type Facing } from '../shapes.js';
import { npc } from '../village.js';
import { LAUNCHPADS } from './features.js';
import { buildJail } from './jail.js';
import { buildJumpStart, JUMP_AND_RUN } from './jumpandrun.js';
import { fence, field, forest, houseAt, lampPost, MODES, mountains, ramp, stallAt } from './common.js';
import { buildSchlossmarkt, RING_MODES } from './schlossmarkt.js';
import { buildSchlosstreppe } from './schlosstreppe.js';
import { FOUNTAIN_BASIN } from './walk.js';

export const LOBBY = { cx: 0, cz: 0, name: 'Dorfplatz am Schlossberg' };

const HILL = { x: 0, z: -119, top: 44, foot: 92, height: 26 };
/** Pflaster: helle Steine (Philip: „nicht so düster“), dazwischen ein wenig Kopfstein. */
const PAVING = [
  'stone_bricks',
  'polished_andesite',
  'andesite',
  'stone_bricks',
  'polished_andesite',
  'stone',
  'polished_diorite',
  'cobblestone',
];
/** Dorfstraße, Handwerkergasse und Feldwege: heller Sandweg, selten ein Kiesfleck (mehr Kies sah fleckig aus). */
const ROAD = ['dirt_path', 'dirt_path', 'dirt_path', 'dirt_path', 'dirt_path', 'dirt_path', 'gravel'];
/** Hangwald am Schlossberg: unten Laubbäume und Birken (hell), oben Fichten. */
const HILL_FOREST = { spruceAbove: GROUND + 18, broadleaf: 0.75, birch: 0.35 } as const;
/** Am Schlossberg dichteres Gras mit Blumen – es deckt die Erdstufen am Hang. */
const HILL_MEADOW = [
  'short_grass',
  'short_grass',
  'short_grass',
  'tall_grass[half=lower]',
  'fern',
  'dandelion',
  'poppy',
  'cornflower',
  'oxeye_daisy',
  'azure_bluet',
  'pink_tulip',
  'allium',
];
const POND = { x: -66, z: 42, r: 11 };

/** Handwerkergasse nach Westen (zwischen den Ständen hindurch). */
const LANE = { z1: 4, z2: 10, x1: -116, x2: -47 };
/** Oberdorf im Nordosten: kleiner Platz mit Brunnen und Linde, Häuser rundherum. */
const UPPER = { x: 80, z: -40 };
const LANE_HOUSES = [-58, -72, -86, -100] as const;
/**
 * Dorfbrunnen: am Ende der Handwerkergasse und im Oberdorf (Mitte x, z). Im Oberdorf nach Nordwesten gerückt – der
 * Brunnen ist größer als der alte, an der alten Stelle stand im Winter der Christbaum mitten im Becken.
 */
export const VILLAGE_FOUNTAINS: readonly (readonly [number, number])[] = [
  [LANE.x1 + 2, 7],
  [UPPER.x - 5, UPPER.z - 5],
];
/** Dorflinde im Oberdorf (mit Rundbank). */
const LINDE = { x: UPPER.x + 4, z: UPPER.z - 2 } as const;

/** Dorfmarkt: Mitte der Standfront (x, z) und Blickrichtung, je zwei Stände an jeder Ecke des Maibaums. */
export const MARKET: readonly (readonly [number, number, Facing])[] = [
  [-8, -13, 'south'],
  [8, -13, 'south'],
  [-13, -8, 'east'],
  [13, -8, 'west'],
  [-13, 8, 'east'],
  [13, 8, 'west'],
  [-8, 13, 'north'],
  [8, 13, 'north'],
];

/** Der achte Stand gehört keinem Modus: Brezn und Lebkuchen. */
const BREZN_STAND = {
  id: 'brezn',
  name: 'Brezn & Lebkuchen',
  colour: 'brown',
  line: 'Frisch aus der Backstube',
  status: 'Servus!',
  skin: 'kraemer',
  icon: 'bread',
  goods: ['cake', 'hay_block', 'barrel[facing=up]', 'potted_red_tulip'],
} as const;

/** Aussichtspunkte für die Bilder: Name, Kamera, Blickziel. */
export const LOBBY_VIEWS = [
  '1-ankunft 0.5 67.6 30.5 @ 0 92 -120',
  '2-marktstaende 0.5 67 28 @ 0 68 -10',
  '3-stand-nah -2 66 -6 @ -8 66.8 -14',
  '4-von-oben 75 148 45 @ 0 78 -75',
  '5-biergarten 33 66.2 -11 @ 47 65.5 2',
  '6-wirtshaus-innen 73.5 65.2 6.5 @ 79 65.4 -3',
  '7-wirtshaus-schank 75.5 65.2 0.5 @ 81.5 66.2 3.5',
  '8-baeckerei-innen -10.5 65.2 34.5 @ -14.5 66.2 31.5',
  '9-handwerkergasse -48 67 7 @ -104 66 7',
  '13-oberdorf 62 68 -30 @ 84 66 -42',
  '14-schmiede-innen -57.5 65.2 0.5 @ -58.5 65.8 -6',
  '10-dorfstrasse 0.5 66 100 @ 0 70 20',
  '11-schloss 17 92 -104 @ 0 104 -140',
  '12-dorfplatz-leute 14 66 18 @ -2 65.5 2',
  '15-festsaal 0.5 94.6 -130.5 @ 0.5 96 -141',
  '16-rotunde 4.5 94 -132.5 @ 0.5 108 -136.5',
  '17-thron 6.5 94.6 -136.5 @ 26 95 -136.5',
  '18-galerie 24.5 103 -136.5 @ 8 104 -136.5',
  '19-bibliothek -30.5 94.6 -99.5 @ -35 93.5 -124',
  '20-rittersaal 30.5 94.6 -124.5 @ 35 93.5 -100',
  '21-schlossmarkt 0.5 69 -16 @ 0 68 -31',
  '22-schlossmarkt-west -9 67.5 -22 @ -36 66 -32',
  '23-schlossmarkt-ost 9 67.5 -22 @ 36 66 -32',
  '24-marktbogen 0.5 66.6 -19 @ 0.5 70 -28',
  '25-stand-neu 26 66.8 -25 @ 20 66.6 -33',
  '26-schlosstreppe 0.5 70 -12 @ 0.5 80 -60',
  '27-schlossvorplatz 0.5 98 -93 @ 0.5 75 -40',
  '28-schlosstor 0.5 92.5 -70 @ 0.5 98 -96',
  '29-prunktreppe 0.5 95.5 -130.5 @ 0.5 99 -142',
  '30-bibliothek-tuer -18.5 92.6 -111.5 @ -30 94 -111.5',
];

/** Gäste im Biergarten: [Tisch-x, Tisch-z, Platz, Seite (1 = Süden), Skin, in der Hand]. */
const BEER_GUESTS: readonly (readonly [number, number, number, 1 | -1, string, string?])[] = [
  [32, -6, 1, -1, 'gast1', 'honey_bottle'],
  [32, -6, 3, 1, 'gast2'],
  [32, -6, 2, 1, 'gast3', 'honey_bottle'],
  [40, -2, 0, -1, 'gast4'],
  [40, -2, 2, -1, 'gast5', 'honey_bottle'],
  [40, -2, 3, 1, 'gast6', 'bread'],
  [48, 2, 1, -1, 'gast7', 'honey_bottle'],
  [48, 2, 2, 1, 'gast8'],
  [40, 6, 1, 1, 'kellnerin2'],
  [32, 10, 2, -1, 'schreiner', 'honey_bottle'],
  [32, 10, 3, -1, 'gast2', 'cookie'],
  [48, -10, 0, 1, 'gast3'],
];

/** Leute, die später im Dorf herumlaufen (Lobby-Plugin): [x, z, Blick, Skin, Weg, Kind?]. */
const WALKERS: readonly (readonly [number, number, Facing, string, string, boolean?])[] = [
  [2, 9, 'west', 'gast6', 'dorfplatz'],
  [-3, -5, 'south', 'gast4', 'dorfplatz'],
  [3, 7, 'north', 'bua', 'dorfplatz', true],
  [5, 6, 'west', 'madl', 'dorfplatz', true],
  [1, 48, 'south', 'gast7', 'dorfstrasse'],
  [-1, 70, 'north', 'gast8', 'dorfstrasse'],
  [-70, 7, 'east', 'gast1', 'gasse'],
  [-92, 6, 'west', 'gast5', 'gasse'],
  [80, -33, 'south', 'gast2', 'oberdorf'],
  [44, 8, 'north', 'kellnerin', 'biergarten'],
  // neben dem roten Teppich (auf Teppich laufen die Dorfleute nicht – er hat eine dünne Kollision)
  [4, -27, 'north', 'gast3', 'prachtstrasse'],
];

const SHORE: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Garten hinter einem Haus: Zaun mit Tor (Mitte `gate`), Obstbaum in der Mitte. */
function backGarden(
  c: Canvas,
  [x1, z1, x2, z2]: readonly [number, number, number, number],
  gate: readonly [number, number],
  rnd: () => number,
): void {
  fence(c, x1, z1, x2, z2, GROUND + 1, [gate[0], gate[1]]);
  const [cx, cz] = [Math.round((x1 + x2) / 2), Math.round((z1 + z2) / 2)];
  roundTree(c, cx, GROUND + 1, cz, { height: 8, radius: 3, leaves: 'oak_leaves', rnd });
}

/** Dorflinde im Oberdorf: Grasfleck im Pflaster und eine Rundbank (vier Bänke, Lehne zum Stamm). */
function dorflinde(c: Canvas, rnd: () => number): void {
  const { x, z } = LINDE;
  pairs(range(x - 1, x + 1), range(z - 1, z + 1)).forEach(([gx, gz]) => c.set(gx, GROUND, gz, 'grass_block'));
  roundTree(c, x, GROUND + 1, z, { height: 12, radius: 5, leaves: 'oak_leaves', rnd });
  c.tagged('rundbank', () =>
    (['north', 'east', 'south', 'west'] as const).forEach((d) => {
      const [dx, dz] = STEP[d];
      const toTrunk = STEP_BACK[d];
      range(-1, 1).forEach((s) =>
        c.set(
          x + 2 * dx + s * Math.abs(dz),
          GROUND + 1,
          z + 2 * dz + s * Math.abs(dx),
          stairs('spruce', toTrunk),
        ),
      );
    }),
  );
}

/** Lehne zeigt zum Stamm: Treppe nach innen. */
const STEP_BACK: Readonly<Record<Facing, Facing>> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

export function buildLobby(): { canvas: Canvas; height: (x: number, z: number) => number } {
  const c = new Canvas();
  const rnd = random(4711);
  const mtn = mountains(101, LOBBY.cx, LOBBY.cz, 128, 205, 118);
  const height = (x: number, z: number): number => {
    const hill = HILL.height * (1 - ramp(Math.hypot(x - HILL.x, z - HILL.z), HILL.top, HILL.foot));
    const roll = Math.max(0, ramp(Math.hypot(x, z), 128, 160) * 7 * (fbm(5, x, z, 26, 2) - 0.35));
    const pond = Math.hypot(x - POND.x, z - POND.z) < POND.r ? -3 : 0;
    return Math.round(GROUND + Math.max(hill, mtn(x, z)) + roll + pond);
  };
  terrain(c, {
    x1: -215,
    z1: -215,
    x2: 215,
    z2: 215,
    height,
    snowLine: 150,
    seed: 101,
    skipFlat: true,
    // Der Teich steht bis an den Rand voll (vorher eine Stufe darunter – Schilf am Ufer hatte kein Wasser daneben).
    waterLevel: GROUND,
  });

  // Dorfplatz: Kopfsteinpflaster, Rand mit Laternen, Maibaum
  discAt(c, 0, GROUND, 0, 22, () => pick(rnd, PAVING));
  disc(0, 0, 22.6)
    .filter(([x, z]) => Math.hypot(x, z) > 21.5)
    .forEach(([x, z]) => c.set(x, GROUND, z, 'polished_andesite'));
  range(0, 13).forEach((i) => {
    const a = (i / 14) * Math.PI * 2;
    const [lx, lz] = [Math.round(Math.cos(a) * 23.5), Math.round(Math.sin(a) * 23.5)];
    if (Math.abs(lx) > 5) lampPost(c, lx, GROUND, lz);
  });
  c.tagged('maibaum', () => maypole(c, 0, GROUND, 0, 30));
  c.place('Dorfplatz', -21, GROUND + 1, -21, 21, 21);

  // Prachtstraße vom Dorfplatz zum Schlossmarkt (Achse x = 0); weiter hinauf geht es über die Schlosstreppe
  range(-5, 5).forEach((x) =>
    range(-30, -22).forEach((z) =>
      c.set(x, GROUND, z, Math.abs(x) === 5 ? 'polished_andesite' : pick(rnd, PAVING)),
    ),
  );
  range(-50, 50).forEach((x) => range(-38, -23).forEach((z) => c.set(x, GROUND, z, pick(rnd, PAVING))));
  // Weg vom Platz zur Handwerkergasse
  range(-47, -22).forEach((x) => range(3, 11).forEach((z) => c.set(x, GROUND, z, pick(rnd, PAVING))));

  // Dorfmarkt: acht Stände eng im Kreis um den Maibaum, je zwei an jeder Ecke, Gassen in alle vier Richtungen
  MARKET.forEach(([x, z, front], i) => {
    const mode = i < RING_MODES ? MODES[i] : undefined;
    if (mode) stallAt(c, x, GROUND, z, front, mode);
    else stallAt(c, x, GROUND, z, front, BREZN_STAND, ['mm_village', 'mm_market']);
  });
  // An den inneren Ecken Heuballen mit Kürbis, an den äußeren Fässer und Kisten
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sz) => {
      c.set(sx * 10, GROUND + 1, sz * 10, 'hay_block');
      c.set(sx * 10, GROUND + 2, sz * 10, pick(rnd, ['carved_pumpkin', 'melon', 'pumpkin']));
      [
        [17, 17],
        [18, 17],
        [17, 18],
      ].forEach(([a, b]) => {
        const crate = pick(rnd, ['barrel[facing=up]', 'barrel[facing=up]', 'composter[level=8]']);
        // Auf dem Fass an der Ecke steht ein Blumentopf – der braucht eine flache Fläche (kein Komposter)
        c.set(sx * a!, GROUND + 1, sz * b!, a === 17 && b === 17 ? 'barrel[facing=up]' : crate);
      });
      c.set(
        sx * 17,
        GROUND + 2,
        sz * 17,
        pick(rnd, ['potted_red_tulip', 'potted_poppy', 'potted_pink_tulip']),
      );
    }),
  );

  // Schlossmarkt: alle weiteren Modi in einer Marktzeile auf dem Vorplatz vor der Schlosstreppe
  c.tagged('schlossmarkt', () => buildSchlossmarkt(c, height));
  // Schlosstreppe hinauf zum Schloss, oben der Schlossvorplatz vor dem Tor
  c.tagged('schlosstreppe', () => buildSchlosstreppe(c, height));

  // Dorfstraße nach Süden: Läden und Wohnhäuser (alle begehbar), Kapelle am Ende
  range(-3, 3).forEach((x) =>
    range(22, 104).forEach((z) => c.set(x, GROUND, z, Math.abs(x) === 3 ? 'stone_bricks' : pick(rnd, ROAD))),
  );
  const west = [
    { interior: 'baeckerei', sign: 'Bäckerei' },
    { interior: 'wohnhaus' },
    { interior: 'laden', sign: 'Krämerladen' },
    { interior: 'wohnhaus' },
  ] as const;
  const east = [
    { interior: 'apotheke', sign: 'Apotheke' },
    { interior: 'wohnhaus' },
    { interior: 'wohnhaus' },
    { interior: 'wohnhaus' },
  ] as const;
  [32, 50, 68, 86].forEach((z, i) => {
    // Dächer im Wechsel hell und dunkel (vorher links alle dunkel)
    houseAt(
      c,
      -10,
      GROUND,
      z,
      'east',
      11,
      11,
      2 + (i % 2),
      rnd,
      i % 2 === 0 ? 'dark_oak' : 'spruce',
      west[i],
    );
    houseAt(
      c,
      10,
      GROUND,
      z + 6,
      'west',
      11,
      11,
      3 - (i % 2),
      rnd,
      i % 2 === 0 ? 'spruce' : 'dark_oak',
      east[i],
    );
    // Gärten hinter den Häusern, Tor zum Haus hin, Obstbaum in der Mitte (hinter den ersten beiden Häusern stehen
    // Rathaus bzw. Gäste-Info – dort keiner)
    if (i > 0) {
      backGarden(c, [-32, z - 6, -22, z + 6], [-22, z], rnd);
      backGarden(c, [22, z, 32, z + 12], [22, z + 6], rnd);
    }
  });
  // Laternen an der Dorfstraße, je zwischen zwei Häusern (nachts war es dort bisher dunkel)
  [41, 59, 77, 95].forEach((z) => lampPost(c, -4, GROUND, z));
  [47, 65, 83, 101].forEach((z) => lampPost(c, 4, GROUND, z));
  c.place('Dorfstraße', -2, GROUND + 1, 22, 2, 104);
  c.tagged('kapelle', () => chapel(c, -4, GROUND, 108, 'north'));
  houseAt(c, -30, GROUND, 30, 'north', 11, 11, 3, rnd, 'dark_oak', { interior: 'rathaus', sign: 'Rathaus' });
  houseAt(c, 30, GROUND, 30, 'north', 9, 10, 2, rnd, 'dark_oak', { interior: 'info', sign: 'Gäste-Info' });

  // Handwerkergasse nach Westen: Vorgärten, Häuser auf beiden Seiten, Brunnen am Ende
  range(LANE.x1, LANE.x2).forEach((x) =>
    range(LANE.z1, LANE.z2).forEach((z) =>
      c.set(x, GROUND, z, z === LANE.z1 || z === LANE.z2 ? 'stone_bricks' : pick(rnd, ROAD)),
    ),
  );
  const north = [
    { interior: 'schmiede', sign: 'Schmiede' },
    { interior: 'wohnhaus' },
    { interior: 'wohnhaus' },
    { interior: 'wohnhaus' },
  ] as const;
  const south = [
    { interior: 'wohnhaus' },
    { interior: 'wohnhaus' },
    { interior: 'laden', sign: 'Trachten' },
    { interior: 'schreinerei', sign: 'Schreinerei' },
  ] as const;
  const gardens = [
    'poppy',
    'cornflower',
    'oxeye_daisy',
    'allium',
    'pink_tulip',
    'short_grass',
    'short_grass',
  ];
  LANE_HOUSES.forEach((x, i) => {
    houseAt(
      c,
      x,
      GROUND,
      LANE.z1 - 5,
      'south',
      11,
      10,
      2 + (i % 2),
      rnd,
      i % 2 === 0 ? 'dark_oak' : 'spruce',
      north[i],
    );
    houseAt(
      c,
      x,
      GROUND,
      LANE.z2 + 5,
      'north',
      11,
      10,
      3 - (i % 2),
      rnd,
      i % 2 === 0 ? 'spruce' : 'dark_oak',
      south[i],
    );
    [LANE.z1 - 1, LANE.z2 + 1].forEach((z) => lampPost(c, x + 7, GROUND, z));
    // Vorgärten: Blumen, Hecke vorne, Weg zur Tür frei
    // (die Reihe direkt vor dem Haus bleibt frei: Fensterbänke, Hausbank, Wandbretter der Laternen)
    [
      [LANE.z1 - 3, LANE.z1 - 1],
      [LANE.z2 + 1, LANE.z2 + 3],
    ].forEach(([za = 0, zb = 0]) =>
      range(x - 5, x + 5).forEach((gx) =>
        range(za, zb).forEach((gz) => {
          if (Math.abs(gx - x) < 1) return c.set(gx, GROUND, gz, 'gravel');
          const edge = gz === LANE.z1 - 1 || gz === LANE.z2 + 1;
          c.set(gx, GROUND + 1, gz, edge ? 'azalea_leaves[persistent=true]' : pick(rnd, gardens));
        }),
      ),
    );
  });
  c.place('Handwerkergasse', LANE.x1, GROUND + 1, LANE.z1 + 1, LANE.x2, LANE.z2 - 1);
  discAt(c, LANE.x1 + 2, GROUND, 7, 9, () => pick(rnd, PAVING));

  // Oberdorf: Platz mit Brunnen und Linde, vier Häuser rundherum, Weg zum Vorplatz
  discAt(c, UPPER.x, GROUND, UPPER.z, 10, () => pick(rnd, PAVING));
  c.place('Oberdorf', UPPER.x - 7, GROUND + 1, UPPER.z - 7, UPPER.x + 7, UPPER.z + 7);
  VILLAGE_FOUNTAINS.forEach(([x, z]) => {
    c.tagged(`brunnen ${x},${z}`, () => dorfbrunnen(c, x, GROUND, z));
    // Wasserbecken rund um die Säule: zu Fuß gewollt nicht (Prüfung „zu Fuß erreichbar“, `ON_PURPOSE`)
    c.place(FOUNTAIN_BASIN, x - 1, GROUND + 1, z - 1, x + 1, z + 1);
  });
  dorflinde(c, rnd);
  houseAt(c, UPPER.x - 8, GROUND, UPPER.z - 11, 'south', 11, 10, 3, rnd, 'dark_oak', {
    interior: 'wohnhaus',
  });
  houseAt(c, UPPER.x + 8, GROUND, UPPER.z - 11, 'south', 11, 11, 2, rnd, 'spruce', { interior: 'wohnhaus' });
  houseAt(c, UPPER.x + 12, GROUND, UPPER.z + 3, 'west', 11, 10, 2, rnd, 'dark_oak', { interior: 'wohnhaus' });
  houseAt(c, UPPER.x + 2, GROUND, UPPER.z + 12, 'north', 9, 10, 2, rnd, 'spruce', { interior: 'wohnhaus' });
  lampPost(c, UPPER.x - 9, GROUND, UPPER.z + 4);
  lampPost(c, UPPER.x + 9, GROUND, UPPER.z + 8);

  // Biergarten im Osten mit Wirtshaus (Wirt hinterm Tresen, Stammtisch, Gäste)
  c.tagged('biergarten', () => biergarten(c, 30, -16, 60, 16, GROUND, rnd));
  houseAt(c, 72, GROUND, 0, 'west', 15, 13, 3, rnd, 'dark_oak', {
    interior: 'wirtshaus',
    sign: 'Wirtshaus Zum Morni',
  });
  npc(c, {
    x: 56,
    y: GROUND + 1,
    z: -18,
    look: 'south',
    skin: 'wirt',
    hand: 'honey_bottle',
    tags: ['mm_village'],
  });
  BEER_GUESTS.forEach(([tx, tz, seat, side, skin, hand]) =>
    npc(c, {
      x: tx + seat,
      y: GROUND + 1,
      z: tz + side,
      look: side === 1 ? 'north' : 'south',
      skin,
      hand,
      sit: true,
      tags: ['mm_village'],
    }),
  );
  WALKERS.forEach(([x, z, look, skin, route, small]) =>
    npc(c, { x, y: GROUND + 1, z, look, skin, small, tags: ['mm_walker', `mm_route_${route}`] }),
  );

  // Obstgarten, Felder, Teich
  range(0, 4).forEach((i) =>
    range(0, 3).forEach((j) =>
      roundTree(c, 40 + i * 9, GROUND + 1, 44 + j * 10, {
        height: 7,
        radius: 2.6,
        leaves: (i + j) % 3 === 0 ? 'flowering_azalea_leaves' : 'oak_leaves',
        rnd,
      }),
    ),
  );
  field(c, 40, 82, 70, 98, GROUND);
  field(c, -60, 70, -36, 96, GROUND, 'carrots[age=7]');
  fence(c, -61, 69, -35, 97, GROUND + 1, [-48, 69]);
  // Ufer: Schilf nur direkt am Wasser (Zuckerrohr braucht Wasser daneben), sonst Gras
  const inPond = (x: number, z: number): boolean => Math.hypot(x - POND.x, z - POND.z) < POND.r;
  disc(POND.x, POND.z, POND.r + 1.5)
    .filter(([x, z]) => !inPond(x, z))
    .forEach(([x, z]) => {
      const shore = SHORE.some(([dx, dz]) => inPond(x + dx, z + dz));
      c.set(x, GROUND + 1, z, rnd() < 0.3 && shore ? 'sugar_cane' : 'short_grass');
    });

  // Schloss auf dem Hügel, Freitreppe nach Süden
  c.tagged('schloss', () =>
    castle(c, {
      x: 0,
      y: GROUND + HILL.height,
      z: -96,
      front: 'south',
      wallDrop: 14,
      rnd,
      // vor dem Tor liegt der Schlossvorplatz (schlosstreppe.ts)
      frontStairs: false,
    }),
  );
  LAUNCHPADS.forEach((l) => c.tagged('launchpad', () => launchpad(c, l.x, l.y, l.z)));
  // Gefängnis: Arrestzelle im Rathauskeller (das Lobby-Plugin hält Eingesperrte dort)
  c.tagged('gefaengnis', () => buildJail(c));

  // Jump and Run im Nordwesten: Startplatz mit Smaragd und Tafel – die Blöcke zeigt das Lobby-Plugin hoch oben
  buildJumpStart(c);
  const jump = JUMP_AND_RUN.start;
  c.place('Jump and Run: Startfeld', jump.x, jump.y + 1, jump.z, jump.x, jump.z);

  const pathBlocks = ROAD;
  path(
    c,
    [
      [50, 16],
      [62, 40],
      [62, 70],
    ],
    3,
    (x, z) => height(x, z),
    () => pick(rnd, pathBlocks),
  );
  path(
    c,
    [
      [-46, 20],
      [-50, 40],
      [-48, 68],
    ],
    3,
    (x, z) => height(x, z),
    () => pick(rnd, pathBlocks),
  );
  path(
    c,
    [
      [50, -30],
      [62, -34],
      [70, -40],
    ],
    3,
    (x, z) => height(x, z),
    () => pick(rnd, pathBlocks),
  );

  const castleArea = (x: number, z: number): boolean => Math.abs(x) < 42 && z < -78 && z > -168;
  const laneArea = (x: number, z: number): boolean => x < -40 && x > LANE.x1 - 14 && z > -12 && z < 26;
  // Um die Kapelle keine Bäume (sie wuchsen sonst durch Schiff und Dach)
  const chapelArea = (x: number, z: number): boolean => x > -18 && x < 4 && z > 96 && z < 128;
  forest(
    c,
    -215,
    -215,
    215,
    215,
    height,
    (x, z, h) => {
      const d = Math.hypot(x, z);
      const onHill = Math.hypot(x - HILL.x, z - HILL.z) < HILL.top + 6;
      return h < 150 && !onHill && !castleArea(x, z) && !laneArea(x, z) && !chapelArea(x, z) && d > 112;
    },
    101,
    rnd,
  );
  forest(
    c,
    -100,
    -100,
    100,
    120,
    height,
    (x, z, h) => {
      const nearHill = Math.hypot(x - HILL.x, z - HILL.z);
      return (
        nearHill > HILL.top + 6 &&
        nearHill < HILL.foot &&
        Math.abs(x) > 14 &&
        !(Math.abs(x) < 54 && z > -46) && // Schlossmarkt mit Stützmauer bleibt frei
        h > GROUND + 2 &&
        !castleArea(x, z)
      );
    },
    202,
    rnd,
    HILL_FOREST,
  );
  // Schlossberg dicht bewachsen (Gras deckt die Erdstufen), dann Wiesen ringsum
  const onSlope = (x: number, z: number): boolean =>
    Math.hypot(x - HILL.x, z - HILL.z) < HILL.foot && !castleArea(x, z) && !(Math.abs(x) < 54 && z > -42);
  meadow(
    c,
    HILL.x - HILL.foot,
    HILL.z - HILL.foot,
    HILL.x + HILL.foot,
    -40,
    height,
    0.42,
    rnd,
    HILL_MEADOW,
    onSlope,
  );
  meadow(c, -125, -125, 125, 125, height, 0.16, rnd);
  fitFurniture(c);
  fitConnections(c);
  return { canvas: c, height };
}
