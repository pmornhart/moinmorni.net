/* eslint-disable ts-patterns/no-magic-numbers -- a decoration plan: positions, sizes and colours as the lobby needs them */
/**
 * Wiesn – die Saison „Wiesn“ der Lobby, ein eigenes kleines Volksfest:
 *
 * - **Kettenkarussell um den Maibaum** (Herzstück): weiß-blaues Dach in 16 Feldern, 16 Sitze an Ketten, Wimpel und
 *   Lichter am Rand, Licht darunter. Der Maibaum bleibt der Mast; unter den Sitzen läuft man frei durch.
 * - **Festzelt-Eingang** von der Ankunft her: Pfosten, Balken, Giebel mit weiß-blauen Rauten, großes Lebkuchenherz
 *   „Wiesn“, Fahnen, Wimpel und Lichter.
 * - **Riesenrad** auf der Wiese westlich vom Platz: Ring, Speichen, Stützen, acht Gondeln, Lichterkranz.
 * - **Lebkuchenherzen- und Breznbude** am Eingang, Herzen an allen Marktständen, weiß-blaue Wimpel von Stand zu Stand,
 *   über die Dorfstraße und die Handwerkergasse, Fässer.
 *
 * Alles eigene Gestaltung. Blöcke (Dach, Ketten, Riesenrad, Buden, Eingang) setzt die Saison wie der Winter seinen
 * Schnee – jede andere Saison stellt die Stellen genau wieder her.
 */
import { Canvas } from '../canvas.js';
import { GROUND } from '../nature.js';
import type { World } from '../pruefung.js';
import { disc, pairs, range } from '../range.js';
import {
  aroundX,
  blockDisplay,
  itemDisplay,
  placeModel,
  textSign,
  type ModelPart,
  type Vec,
} from './deko.js';
import { anchorEnd, stands } from './halt.js';
import { seasonPlanOf, type SeasonPlan } from './saison-plan.js';
import {
  budeGeruest,
  budeSign,
  bulbs,
  gateFrame,
  inWorld,
  pennants,
  ringCells,
  ringPairs,
  seasonTags,
  segment,
  BUDE_POSTS,
} from './saison-kit.js';
import { CHRISTBAUM } from './christbaum.js';
import { pointAt, STALLS, stallFrame, yawOf } from './weihnachtsmarkt.js';
import { clearPlants, HALF, viewOf, type View } from './winter-base.js';

const S = 'wiesn' as const;
const tag = (kind: string): string => seasonTags(S, kind);
const WEISS_BLAU: readonly string[] = ['white_wool', 'light_blue_wool'];
const LICHTER: readonly string[] = ['glowstone', 'ochre_froglight', 'white_concrete', 'ochre_froglight'];

// ---------- Kettenkarussell ----------

/** Dach des Karussells: Höhe über dem Boden, Radius; Sitze im Kreis darunter. */
export const KARUSSELL = { height: 6, r: 7, seats: 16, seatR: 6 } as const;

/** Sitz an zwei Stangen unter einer Kette (Ursprung: Unterkante der Kette, Vorderseite +z). */
function sitz(farbe: string): ModelPart[] {
  return [
    { at: [-0.22, -0.28, 0], block: 'iron_block', scale: [0.05, 0.56, 0.05] },
    { at: [0.22, -0.28, 0], block: 'iron_block', scale: [0.05, 0.56, 0.05] },
    { at: [0, -0.6, 0], block: farbe, scale: [0.6, 0.1, 0.55] },
    { at: [0, -0.38, -0.25], block: farbe, scale: [0.6, 0.4, 0.08] },
    { at: [0, -0.7, 0.26], block: 'iron_block', scale: [0.5, 0.12, 0.08] },
  ];
}

function karussell(w: Canvas, v: View): string[] {
  const { x: cx, z: cz } = CHRISTBAUM;
  const y = GROUND + KARUSSELL.height;
  const free = (x: number, yy: number, z: number): boolean => v.now(x, yy, z) === 'air';
  // Dach: 16 Felder weiß und blau, blauer Rand, oben ein kleiner weißer Hut um den Mast
  disc(cx, cz, KARUSSELL.r)
    .filter(([x, z]) => !(x === cx && z === cz) && free(x, y, z))
    .forEach(([x, z]) => {
      const r = Math.hypot(x - cx, z - cz);
      const sector = Math.floor(((Math.atan2(z - cz, x - cx) + Math.PI) / (2 * Math.PI)) * 16) % 2;
      w.set(x, y, z, r > KARUSSELL.r - 0.8 ? 'light_blue_wool' : (WEISS_BLAU[sector] ?? 'white_wool'));
    });
  disc(cx, cz, 2.2)
    .filter(([x, z]) => !(x === cx && z === cz) && free(x, y + 1, z))
    .forEach(([x, z]) => w.set(x, y + 1, z, 'white_wool'));
  // Licht unter dem Dach
  range(0, 7).forEach((i) => {
    const a = ((i + HALF) / 8) * Math.PI * 2;
    w.set(Math.round(cx + Math.cos(a) * 3.5), y - 1, Math.round(cz + Math.sin(a) * 3.5), 'light[level=15]');
  });
  // Ketten und Sitze
  const spots = new Map<string, readonly [number, number, number]>();
  range(0, KARUSSELL.seats - 1).forEach((k) => {
    const a = ((k + HALF) / KARUSSELL.seats) * Math.PI * 2;
    const x = Math.round(cx + HALF + Math.cos(a) * KARUSSELL.seatR - HALF);
    const z = Math.round(cz + HALF + Math.sin(a) * KARUSSELL.seatR - HALF);
    spots.set(`${x},${z}`, [x, z, a]);
  });
  const seats = [...spots.values()].flatMap(([x, z, a], i) => {
    if (w.get(x, y, z) === undefined || !free(x, y - 1, z) || !free(x, y - 2, z)) return [];
    w.set(x, y - 1, z, 'iron_chain[axis=y]');
    w.set(x, y - 2, z, 'iron_chain[axis=y]');
    const yaw = Math.atan2(-Math.sin(a), Math.cos(a));
    return placeModel(
      tag('karussell'),
      [x + HALF, y - 2, z + HALF],
      yaw,
      sitz(i % 2 === 0 ? 'red_concrete' : 'yellow_concrete'),
    );
  });
  // Wimpel und Lichter rund um den Rand (unter der Dachkante)
  const ring = (r: number, yy: number): Vec[] =>
    range(0, 16).map((k): Vec => {
      const a = (k / 16) * Math.PI * 2;
      return [cx + HALF + Math.cos(a) * r, yy, cz + HALF + Math.sin(a) * r];
    });
  const flagRing = ring(6.6, y);
  const lightRing = ring(6.2, y - 0.08);
  const flags = flagRing
    .slice(1)
    .flatMap((p, k) => pennants(S, 'karussell', flagRing[k] ?? p, p, 0.12, WEISS_BLAU));
  const lights = lightRing
    .slice(1)
    .flatMap((p, k) => bulbs(S, 'karussell', lightRing[k] ?? p, p, 0.05, LICHTER));
  return [...seats, ...flags, ...lights];
}

// ---------- Festzelt-Eingang ----------

function festzelt(w: Canvas): string[] {
  const { x1, x2, z, beam } = gateFrame(w, { post: 'stripped_spruce_log', beam: 'spruce_planks', height: 6 });
  // Giebel mit weiß-blauen Rauten, Rand aus Holz
  range(1, 6).forEach((k) => {
    const from = x1 + k;
    const to = x2 - k;
    const raute = (x: number): string => ((x + k) % 2 === 0 ? 'white_concrete' : 'light_blue_concrete');
    range(from, to).forEach((x) =>
      w.set(x, beam + k, z, x === from || x === to ? 'spruce_planks' : raute(x)),
    );
  });
  // Fahnen auf dem First, Laternen auf den Balkenenden
  const top = beam + 6;
  [x1 + 6, x2 - 6].forEach((x, i) => {
    w.set(x, top + 1, z, 'spruce_fence');
    w.set(x, top + 2, z, i === 0 ? 'light_blue_banner[rotation=4]' : 'white_banner[rotation=4]');
  });
  [x1, x2].forEach((x) => w.set(x, beam + 1, z, 'lantern'));
  // Großes Lebkuchenherz auf dem Giebel, darunter der Gruß
  const heart = textSign(tag('eingang'), [HALF, beam + 0.6, z + 1.04], 0, [{ text: '♥', color: 'red' }], 10);
  const name = textSign(
    tag('eingang'),
    [HALF, beam + 2.35, z + 1.08],
    0,
    [{ text: 'Wiesn', color: 'white', bold: true }],
    2.2,
  );
  // Gruß oben im Giebel über dem Herz (unter dem Balken überlappte er den Begrüßungstitel bei der Ankunft)
  const sign = textSign(
    tag('eingang'),
    [HALF, beam + 3.75, z + 1.08],
    0,
    [
      { text: 'Servus auf der Wiesn!\\n', color: 'gold', bold: true },
      { text: 'Welcome to the fair', color: 'white' },
    ],
    0.8,
  );
  const flags = pennants(
    S,
    'eingang',
    [x1 + 1.05, beam - 0.02, z + 1.06],
    [x2 - 0.05, beam - 0.02, z + 1.06],
    0.35,
    WEISS_BLAU,
  );
  // Lichter an den Giebelkanten (Südseite)
  const edge = (from: Vec, to: Vec): string[] => bulbs(S, 'eingang', from, to, 0, LICHTER);
  const lights = [
    ...edge([x1 + 1.5, beam + 1, z + 1.06], [HALF + 0.0, beam + 6.6, z + 1.06]),
    ...edge([x2 - 0.5, beam + 1, z + 1.06], [HALF + 1.0, beam + 6.6, z + 1.06]),
  ];
  return [heart, name, sign, ...flags, ...lights];
}

// ---------- Riesenrad ----------

/** Riesenrad auf der Wiese westlich vom Platz: Mitte (Nabe), Radius des Rings; das Rad steht in der Ebene x = Mitte. */
export const RIESENRAD = { x: -37, y: GROUND + 11, z: -9, r: 8 } as const;
const GONDEL_FARBEN: readonly string[] = [
  'red_concrete',
  'light_blue_concrete',
  'yellow_concrete',
  'lime_concrete',
  'orange_concrete',
  'magenta_concrete',
  'cyan_concrete',
  'white_concrete',
];

/** Speichen reichen bis knapp in den Ring hinein (dort halten sie). */
const SPOKE_INSET = 0.46;

/** Felder (x, z), die das Riesenrad samt Stützen und Bühne am Boden belegt. */
export function riesenradArea(): Array<[number, number]> {
  return pairs(range(RIESENRAD.x - 2, RIESENRAD.x + 2), range(RIESENRAD.z - 6, RIESENRAD.z + 6));
}

/** Stab des Riesenrads von a nach b. */
const bar = (a: Vec, b: Vec, thick: number, block: string): string =>
  segment(S, 'riesenrad', a, b, thick, block);

function riesenrad(w: Canvas, v: View, world: World): string[] {
  const { x, y, z, r } = RIESENRAD;
  const [cy, cz] = [y + HALF, z + HALF];
  riesenradArea().forEach(([px, pz]) => clearPlants(w, v, px, pz));
  // Bühne: Holzboden unter dem Rad, Geländer mit Laternen an den Ecken
  pairs(range(x - 2, x + 2), range(z - 3, z + 3)).forEach(([px, pz]) =>
    w.set(px, GROUND, pz, 'spruce_planks'),
  );
  pairs([x - 2, x + 2], [z - 3, z + 3]).forEach(([px, pz]) => {
    w.set(px, GROUND + 1, pz, 'spruce_fence');
    w.set(px, GROUND + 2, pz, 'lantern');
  });
  // Tafel am Aufgang (Ostseite): Brett auf zwei Pfosten
  [z - 1, z + 1].forEach((pz) => w.set(x + 2, GROUND + 1, pz, 'spruce_fence'));
  range(z - 1, z + 1).forEach((pz) => w.set(x + 2, GROUND + 2, pz, 'stripped_spruce_wood'));
  // Ring (ein Block dick, in der Ebene x), jedes sechste Feld blau – ohne Ecken-Lücken, damit er an einem Stück hält
  ringCells(cy, cz, r).forEach(([yy, zz]) => {
    const a = Math.atan2(yy + HALF - cy, zz + HALF - cz);
    const step = Math.round((a / (2 * Math.PI)) * 48);
    w.set(x, yy, zz, step % 6 === 0 ? 'light_blue_concrete' : 'white_concrete');
  });
  // Einstieg unter dem tiefsten Punkt: Podest und Stütze tragen den Ring
  pairs(range(x - 1, x + 1), range(z - 1, z + 1)).forEach(([px, pz]) =>
    w.set(px, GROUND + 1, pz, 'spruce_planks'),
  );
  range(GROUND + 2, y - r - 1).forEach((yy) => w.set(x, yy, z, 'stripped_spruce_log'));
  const hub = blockDisplay(tag('riesenrad'), [x + HALF, cy, cz], 'iron_block', { scale: [0.9, 0.9, 0.9] });
  // Achse links und rechts der Nabe, Stützen schräg zum Boden
  const axle = [
    blockDisplay(tag('riesenrad'), [x - 0.6, cy, cz], 'iron_block', { scale: [1.2, 0.35, 0.35] }),
    blockDisplay(tag('riesenrad'), [x + 1.6, cy, cz], 'iron_block', { scale: [1.2, 0.35, 0.35] }),
  ];
  const legs = [x - 0.85, x + 1.85].flatMap((lx) =>
    [-5, 5].map((dz) => bar([lx, GROUND + 1.14, cz + dz], [lx, cy, cz], 0.26, 'white_concrete')),
  );
  // Speichen von der Nabe zum Ring
  const spokes = range(0, 11).map((k) => {
    const a = (k / 12) * Math.PI * 2;
    // bis knapp an die Nabe (ein Würfel: zur Ecke hin weiter weg als zur Seite)
    const inner = 0.45 / Math.max(Math.abs(Math.sin(a)), Math.abs(Math.cos(a)));
    const from: Vec = [x + HALF, cy + Math.sin(a) * inner, cz + Math.cos(a) * inner];
    const to: Vec = [x + HALF, cy + Math.sin(a) * (r - SPOKE_INSET), cz + Math.cos(a) * (r - SPOKE_INSET)];
    return bar(from, to, 0.12, 'white_concrete');
  });
  // Gondeln: an einem kurzen Arm vor dem Ring (Ostseite), darunter die Kabine
  const gondeln = range(0, 7).flatMap((k) => {
    const a = ((k + HALF) / 8) * Math.PI * 2;
    const py = cy + Math.sin(a) * r;
    const pz = cz + Math.cos(a) * r;
    const farbe = GONDEL_FARBEN[k % GONDEL_FARBEN.length] ?? 'red_concrete';
    const parts: ModelPart[] = [
      { at: [x + 1.25, py, pz], block: 'iron_block', scale: [0.5, 0.08, 0.08] },
      { at: [x + 1.5, py - 0.3, pz], block: 'iron_block', scale: [0.06, 0.6, 0.06] },
      { at: [x + 1.5, py - 0.66, pz], block: 'white_concrete', scale: [1.0, 0.12, 0.9] },
      { at: [x + 1.5, py - 1.07, pz], block: farbe, scale: [0.9, 0.7, 0.8] },
    ];
    const cmds = inWorld(S, 'riesenrad', parts);
    return stands(world, cmds) ? cmds : [];
  });
  // Lichterkranz vorne am Ring
  const crown = range(0, 48).map((k): Vec => {
    const a = (k / 48) * Math.PI * 2;
    return [x + 1.06, cy + Math.sin(a) * r, cz + Math.cos(a) * r];
  });
  const lights = crown.slice(1).flatMap((p, k) => bulbs(S, 'riesenrad', crown[k] ?? p, p, 0, LICHTER, 0.18));
  const sign = textSign(
    tag('riesenrad'),
    [x + 3.02, GROUND + 2.25, cz],
    90,
    [
      { text: 'Riesenrad\\n', color: 'gold', bold: true },
      { text: 'Ferris wheel', color: 'white' },
    ],
    0.9,
  );
  return [hub, ...axle, ...legs, ...spokes, ...gondeln, ...lights, sign];
}

// ---------- Buden am Eingang ----------

const HERZ_WORTE: readonly (readonly [string, string])[] = [
  ['Servus', 'white'],
  ['I mog di', 'yellow'],
  ['Wiesn', 'white'],
];

function buden(w: Canvas, v: View): string[] {
  const lebkuchen = budeGeruest(w, v, 0, 'spruce', 'spruce_planks');
  [1, 2, 3].forEach((u) => lebkuchen.set(u, 1, 1, 'barrel[facing=up]'));
  lebkuchen.set(2, 3, 0, 'cake');
  lebkuchen.set(2, 4, 1, 'light[level=14]');
  const herzen = HERZ_WORTE.flatMap(([wort, farbe], i) => {
    const at = pointAt(lebkuchen, 1.5 + i, BUDE_POSTS - 0.55, -0.06);
    const yaw = (-yawOf(lebkuchen.front) * 180) / Math.PI;
    return [
      textSign(tag('bude'), at, yaw, [{ text: '♥', color: 'red' }], 3.2),
      textSign(
        tag('bude'),
        [at[0], at[1] + 0.32, at[2]],
        yaw,
        [{ text: wort, color: farbe, bold: true }],
        0.42,
      ),
    ];
  });
  const brezn = budeGeruest(w, v, 1, 'spruce', 'spruce_planks');
  [1, 2, 3].forEach((u) => brezn.set(u, 1, 1, 'barrel[facing=up]'));
  brezn.set(2, 4, 1, 'light[level=14]');
  const brot = [1.5, 2.5, 3.5].map((u) =>
    itemDisplay(tag('bude'), pointAt(brezn, u, 3.04, 0.5), 'bread', 0.4, aroundX(-Math.PI / 2)),
  );
  const wimpel = [lebkuchen, brezn].flatMap((f) =>
    pennants(
      S,
      'bude',
      pointAt(f, -1, BUDE_POSTS + 1.02, -1.08),
      pointAt(f, 6, BUDE_POSTS + 1.02, -1.08),
      0.15,
      WEISS_BLAU,
    ),
  );
  return [
    budeSign(S, lebkuchen, [
      { text: 'Lebkuchenherzen\\n', color: 'gold', bold: true },
      { text: 'Gingerbread hearts', color: 'white' },
    ]),
    budeSign(S, brezn, [
      { text: 'Brezn & Hendl\\n', color: 'gold', bold: true },
      { text: 'Pretzels & roast chicken', color: 'white' },
    ]),
    ...herzen,
    ...brot,
    ...wimpel,
  ];
}

// ---------- Wimpel über dem Dorf, Herzen, Fässer ----------

/** Kette zwischen zwei Häusern: beide Enden rücken an die nächste Wand. */
function hung(world: World, a: Vec, b: Vec, sag: number, lights: boolean, reach = 6): string[] {
  const a2 = anchorEnd(world, a, b, reach, reach);
  const b2 = a2 && anchorEnd(world, b, a2, reach, reach);
  if (!a2 || !b2) return [];
  return lights ? bulbs(S, 'kette', a2, b2, sag, LICHTER) : pennants(S, 'kette', a2, b2, sag, WEISS_BLAU);
}

/** Lebkuchenherz vorne unter der Markise jedes Marktstands (Rahmen-Koordinaten). */
const HEART: Vec = [3.5, 3.05, -1.1];

function dorf(world: World): string[] {
  const y = GROUND + 6;
  const street = [30, 44, 58, 72, 86, 100].flatMap((z) =>
    hung(world, [-7, y, z + HALF], [8, y, z + HALF], 0.8, false),
  );
  const lane = [-55, -69, -83, -97, -111].flatMap((x) =>
    hung(world, [x + HALF, y, 0], [x + HALF, y, 15], 0.8, false),
  );
  const ring = ringPairs().flatMap(([a, b]) => {
    const gap = Math.hypot(b[0] - a[0], b[2] - a[2]);
    return [
      ...pennants(S, 'kette', a, b, Math.min(1.1, 0.25 + gap * 0.08), WEISS_BLAU),
      ...bulbs(
        S,
        'kette',
        [a[0], a[1] - 0.05, a[2]],
        [b[0], b[1] - 0.05, b[2]],
        Math.min(1.3, 0.35 + gap * 0.08),
        LICHTER,
      ),
    ];
  });
  const hearts = STALLS.map((s) => pointAt(stallFrame(s), ...HEART)).flatMap(([x, yy, z]) => [
    textSign(tag('herz'), [x, yy, z], 0, [{ text: '♥', color: 'red' }], 3.6),
    textSign(tag('herz'), [x, yy + 0.35, z], 0, [{ text: 'Servus!', color: 'white', bold: true }], 0.7),
  ]);
  const barrels = (
    [
      [55.5, GROUND + 1.5, -20.5],
      [56.5, GROUND + 1.5, -20.5],
      [56, GROUND + 2.5, -20.5],
      [60.5, GROUND + 1.5, 18.5],
    ] as const
  ).map((at) =>
    blockDisplay(tag('fass'), at, 'barrel', { scale: [1, 1, 1], properties: { facing: 'south' } }),
  );
  return [...street, ...lane, ...ring, ...hearts, ...barrels];
}

// ---------- Alles zusammen ----------

const cache: { base?: Canvas; plan?: SeasonPlan } = {};

/** Wiesn-Plan über dem Bauplan der Lobby (Blöcke mit Rückweg, Anzeigen). */
export function wiesnPlan(base: Canvas): SeasonPlan {
  if (cache.base === base && cache.plan) return cache.plan;
  const w = new Canvas();
  const v = viewOf(base, w);
  const world: World = (x, y, z) => v.now(x, y, z);
  const displays = [
    ...karussell(w, v),
    ...festzelt(w),
    ...buden(w, v),
    ...riesenrad(w, v, world),
    ...dorf(world),
  ];
  const plan = seasonPlanOf(v, w, displays);
  cache.base = base;
  cache.plan = plan;
  return plan;
}
