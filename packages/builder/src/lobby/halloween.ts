/* eslint-disable ts-patterns/no-magic-numbers -- a decoration plan: positions, sizes and colours as the lobby needs them */
/**
 * Halloween – die Saison „Halloween“ der Lobby, eine schaurig-schöne Nacht im Dorf:
 *
 * - **Riesenkürbis statt Maibaum** (Herzstück): ein Kürbis aus Beton und Terrakotta, gut neun Blöcke hoch, mit
 *   geschnitztem Gesicht nach Süden und Norden, innen leuchtet es (Pilzlicht), oben Stiel und Blatt. Der Maibaum ist so
 *   lange weg und kommt mit jeder anderen Saison genau zurück.
 * - **Kürbisfeld** auf der Wiese westlich vom Platz: Reihen auf grober Erde mit Kürbissen und leuchtenden Fratzen,
 *   zwei Vogelscheuchen.
 * - **Schaurige Ruine** auf der Wiese neben der Ankunft: zerfallene Kapelle aus bemoostem Stein mit Turmstumpf,
 *   Seelenlaternen, Seelenfeuer, Grabsteinen davor und Gespenstern aus Laken.
 * - **Gruselmarkt** am Eingang (Kürbissuppe, Süßes oder Saures), Eingangsbogen mit Kürbissen und Lichtern in Orange
 *   und Lila, Lichter von Stand zu Stand. Dazu wie bisher Kürbisse an Haustüren und Ständen, Spinnweben, Wimpel
 *   (`season.ts`).
 *
 * Grauer Himmel und Nebel kommen über das Biom „Blasser Garten“, Asche in der Luft vom Lobby-Plugin. Alles eigene
 * Gestaltung, nur Blöcke aus dem Spiel.
 */
import { Canvas } from '../canvas.js';
import { GROUND } from '../nature.js';
import { random } from '../noise.js';
import type { World } from '../pruefung.js';
import { disc, pairs, range } from '../range.js';
import {
  aroundY,
  blockDisplay,
  itemDisplay,
  placeModel,
  textSign,
  type ModelPart,
  type Vec,
} from './deko.js';
import { CHRISTBAUM, maibaumBlocks } from './christbaum.js';
import { settle } from './halt.js';
import { seasonPlanOf, type SeasonPlan } from './saison-plan.js';
import {
  budeGarland,
  budeGeruest,
  budeSign,
  bulbs,
  gateFrame,
  gateSign,
  ringPairs,
  seasonTags,
} from './saison-kit.js';
import { pointAt } from './weihnachtsmarkt.js';
import { BASE, clearPlants, HALF, viewOf, type View } from './winter-base.js';

const S = 'halloween' as const;
const tag = (kind: string): string => seasonTags(S, kind);
const GRUSEL: readonly string[] = [
  'ochre_froglight',
  'pearlescent_froglight',
  'ochre_froglight',
  'verdant_froglight',
];

// ---------- Riesenkürbis ----------

/** Riesenkürbis an Stelle des Maibaums: Radius waagerecht, halbe Höhe, Mitte über dem Pflaster. */
export const RIESENKUERBIS = { r: 6, h: 4.6, y: BASE + 4 } as const;
const SHELL = 2.2;

/**
 * Gesicht (Blick von vorn, oben zuerst): x = Augen, n = Nase, m = Mund. Mitte = Spalte 5, unterste Zeile liegt 1 Block
 * über dem Pflaster.
 */
const GESICHT: readonly string[] = ['.x...x.', 'xx...xx', '...n...', '.......', '.mmmmm.', '..m.m..'];
/** Spalte der Mitte im Gesicht. */
const FACE_MID = 3;
/** Nur die vorderste Schale ist offen (zwei Blöcke tief) – die Seitenwände bleiben. */
const FACE_DEPTH = 2;
/** Ab hier zeigt die Schale nach vorn (sonst wäre es die Seitenwand). */
const FACE_FRONT = 2.5;
const FACE_TOP = BASE + 6;

function riesenkuerbis(w: Canvas, v: View): void {
  const { x: px, z: pz } = CHRISTBAUM;
  const [cx, cz] = [px + HALF, pz + HALF];
  maibaumBlocks().forEach(([x, y, z]) => w.set(x, y, z, 'air'));
  disc(px, pz, Math.ceil(RIESENKUERBIS.r) + 1).forEach(([x, z]) => clearPlants(w, v, x, z));
  const inside = (x: number, y: number, z: number, shrink: number): boolean =>
    ((x + HALF - cx) / (RIESENKUERBIS.r - shrink)) ** 2 +
      ((y + HALF - RIESENKUERBIS.y) / (RIESENKUERBIS.h - shrink)) ** 2 +
      ((z + HALF - cz) / (RIESENKUERBIS.r - shrink)) ** 2 <=
    1;
  const span = range(-Math.ceil(RIESENKUERBIS.r), Math.ceil(RIESENKUERBIS.r));
  const ys = range(BASE, Math.ceil(RIESENKUERBIS.y + RIESENKUERBIS.h));
  const free = (x: number, y: number, z: number): boolean => v.now(x, y, z) === 'air';
  pairs(span, span).forEach(([dx, dz]) =>
    ys.forEach((y) => {
      const [x, z] = [px + dx, pz + dz];
      if (!inside(x, y, z, 0) || !free(x, y, z)) return;
      if (inside(x, y, z, SHELL)) {
        // innen hohl und hell
        if (y === BASE + 1 && dx === 0 && dz === 0) w.set(x, y, z, 'shroomlight');
        else if ((dx + dz) % 3 === 0 && y === BASE + 3) w.set(x, y, z, 'light[level=15]');
        return;
      }
      const sector =
        Math.floor(((Math.atan2(z + HALF - cz, x + HALF - cx) + Math.PI) / (2 * Math.PI)) * 16) % 2;
      w.set(x, y, z, sector === 0 ? 'orange_concrete' : 'orange_terracotta');
    }),
  );
  w.set(px, BASE, pz, 'shroomlight');
  // Gesicht nach Süden (+z) und Norden (−z): die Schale an diesen Stellen offen
  GESICHT.forEach((row, i) =>
    [...row].forEach((ch, j) => {
      if (ch === '.') return;
      const y = FACE_TOP - i;
      [1, -1].forEach((side) => {
        const x = side > 0 ? px + j - FACE_MID : px - (j - FACE_MID);
        const front = range(1, Math.ceil(RIESENKUERBIS.r) + 1)
          .map((d) => pz + side * d)
          .filter((z) => {
            const b = w.get(x, y, z);
            return b === 'orange_concrete' || b === 'orange_terracotta';
          });
        const reach = Math.max(0, ...front.map((z) => Math.abs(z - pz)));
        if (reach < FACE_FRONT) return;
        front.filter((z) => Math.abs(z - pz) > reach - FACE_DEPTH).forEach((z) => w.set(x, y, z, 'air'));
        // dahinter leuchtet es (wie eine Kerze im Kürbis)
        const glow = pz + side * (reach - FACE_DEPTH);
        if (front.includes(glow)) w.set(x, y, glow, 'shroomlight');
      });
    }),
  );
  // Stiel und Blatt
  const shell = new Set(['orange_concrete', 'orange_terracotta']);
  const stemFrom = Math.max(...ys.filter((y) => shell.has(w.get(px, y, pz) ?? ''))) + 1;
  range(stemFrom, stemFrom + 2).forEach((y) => w.set(px, y, pz, 'dark_oak_log'));
  w.set(px + 1, stemFrom + 2, pz, 'dark_oak_log[axis=x]');
  [
    [2, 1, 0],
    [2, 2, 0],
    [3, 1, 0],
    [2, 1, 1],
    [-1, 1, 0],
    [-1, 0, 0],
  ].forEach(([dx = 0, dy = 0, dz = 0]) =>
    w.set(px + dx, stemFrom + dy, pz + dz, 'azalea_leaves[persistent=true]'),
  );
}

// ---------- Kürbisfeld ----------

/** Kürbisfeld auf der Westwiese (Reihen von Westen nach Osten). */
export const KUERBISFELD = { x1: -47, x2: -32, z1: -15, z2: -3 } as const;
const KUERBISSE: readonly string[] = [
  'pumpkin',
  'pumpkin',
  'carved_pumpkin[facing=east]',
  'pumpkin',
  'jack_o_lantern[facing=east]',
];

function kuerbisfeld(w: Canvas, v: View): string[] {
  const { x1, x2, z1, z2 } = KUERBISFELD;
  const rnd = random(3131);
  const field = pairs(range(x1, x2), range(z1, z2)).filter(
    ([x, z]) =>
      v.before(x, GROUND, z) === 'grass_block' &&
      range(BASE, BASE + 3).every((y) => v.before(x, y, z) === 'air'),
  );
  field.forEach(([x, z]) => clearPlants(w, v, x, z));
  // Reihen: grobe Erde, darauf Kürbisse, dazwischen bleibt Gras
  field
    .filter(([, z]) => (z - z1) % 3 !== 2)
    .forEach(([x, z]) => {
      w.set(x, GROUND, z, (x + z) % 5 === 0 ? 'podzol' : 'coarse_dirt');
      if (rnd() < 0.45) w.set(x, BASE, z, KUERBISSE[Math.floor(rnd() * KUERBISSE.length)] ?? 'pumpkin');
    });
  // Vogelscheuchen: Pfahl, Strohleib, Kürbiskopf; Arme und Hut als Anzeigen
  const scarecrows: ReadonlyArray<readonly [number, number]> = [
    [x1 + 4, z1 + 2],
    [x2 - 4, z2 - 3],
  ];
  return scarecrows.flatMap(([x, z]) => {
    w.set(x, GROUND, z, 'coarse_dirt');
    w.set(x, BASE, z, 'dark_oak_fence');
    w.set(x, BASE + 1, z, 'hay_block');
    w.set(x, BASE + 2, z, 'carved_pumpkin[facing=east]');
    const parts: ModelPart[] = [
      { at: [0, 1.62, 0.86], block: 'stripped_dark_oak_log', scale: [0.16, 0.16, 0.72] },
      { at: [0, 1.62, -0.86], block: 'stripped_dark_oak_log', scale: [0.16, 0.16, 0.72] },
      { at: [0, 3.06, 0], block: 'black_wool', scale: [1.3, 0.08, 1.3] },
      { at: [0, 3.3, 0], block: 'black_wool', scale: [0.75, 0.42, 0.75] },
      { at: [0.32, 3.12, 0], block: 'purple_wool', scale: [0.08, 0.1, 0.78] },
    ];
    return placeModel(tag('feld'), [x + HALF, BASE, z + HALF], 0, parts);
  });
}

// ---------- Schaurige Ruine ----------

/** Zerfallene Kapelle neben der Ankunft (Tür nach Westen zum Weg). */
export const RUINE = { x1: 20, x2: 28, z1: 18, z2: 24 } as const;
const MAUER: readonly string[] = [
  'mossy_cobblestone',
  'cobblestone',
  'cracked_stone_bricks',
  'mossy_stone_bricks',
  'stone_bricks',
];

function ruine(w: Canvas, v: View, world: World): string[] {
  const { x1, x2, z1, z2 } = RUINE;
  const rnd = random(1031);
  pairs(range(x1 - 2, x2 + 3), range(z1 - 2, z2 + 2)).forEach(([x, z]) => clearPlants(w, v, x, z));
  // Boden innen
  pairs(range(x1 + 1, x2 - 1), range(z1 + 1, z2 - 1)).forEach(([x, z]) =>
    w.set(x, GROUND, z, rnd() < 0.5 ? 'podzol' : 'coarse_dirt'),
  );
  // Mauern: zerfallen (Höhe springt), Tür im Westen, Fenster
  const wall = pairs(range(x1, x2), range(z1, z2)).filter(
    ([x, z]) => x === x1 || x === x2 || z === z1 || z === z2,
  );
  const midZ = Math.round((z1 + z2) / 2);
  wall.forEach(([x, z]) => {
    const corner = (x === x1 || x === x2) && (z === z1 || z === z2);
    const tower = x === x2 && z === z1;
    const rest = 2 + Math.floor(rnd() * 4);
    const height = Math.max(rest, corner ? 6 : 0, tower ? 9 : 0);
    const door = x === x1 && Math.abs(z - midZ) <= 1;
    range(BASE, BASE + height - 1).forEach((y) => {
      if (door && y <= BASE + 2) return;
      const window = !corner && (x === x2 || z === z1 || z === z2) && y === BASE + 2 && (x + z) % 3 === 0;
      if (window) return;
      w.set(x, y, z, MAUER[Math.floor(rnd() * MAUER.length)] ?? 'cobblestone');
    });
  });
  // Turmstumpf breiter: Ecke im Nordosten zwei Felder dick
  range(BASE, BASE + 7).forEach((y) => {
    w.set(x2 - 1, y, z1, 'mossy_stone_bricks');
    w.set(x2, y, z1 + 1, 'cracked_stone_bricks');
  });
  // Was nach Fenstern und Tür ohne Halt in der Luft hinge, ist schon heruntergefallen
  const stones = new Set(MAUER);
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const all = pairs(range(x1, x2), range(z1, z2)).flatMap(([x, z]) =>
    range(BASE, BASE + 10)
      .filter((y) => stones.has(w.get(x, y, z) ?? ''))
      .map((y) => [x, y, z] as const),
  );
  const held = new Set(all.filter(([, y]) => y === BASE).map(([x, y, z]) => key(x, y, z)));
  const grow = (): boolean => {
    const before = held.size;
    all
      .filter(([x, y, z]) => !held.has(key(x, y, z)))
      .filter(([x, y, z]) =>
        (
          [
            [0, -1, 0],
            [1, 0, 0],
            [-1, 0, 0],
            [0, 0, 1],
            [0, 0, -1],
          ] as const
        ).some(([dx, dy, dz]) => held.has(key(x + dx, y + dy, z + dz))),
      )
      .forEach(([x, y, z]) => held.add(key(x, y, z)));
    return held.size > before;
  };
  Array.from({ length: all.length }).some(() => !grow());
  all.filter(([x, y, z]) => !held.has(key(x, y, z))).forEach(([x, y, z]) => w.set(x, y, z, 'air'));
  // Seelenlaternen auf den Ecken, Seelenfeuer innen
  [
    [x1, z1],
    [x1, z2],
    [x2, z2],
  ].forEach(([x = 0, z = 0]) => {
    const top = range(BASE, BASE + 10).filter(
      (y) => w.get(x, y, z) !== undefined && w.get(x, y, z) !== 'air',
    );
    w.set(x, Math.max(...top) + 1, z, 'soul_lantern');
  });
  w.set(x2, BASE + 9, z1, 'soul_lantern');
  w.set(Math.round((x1 + x2) / 2), BASE, midZ, 'soul_campfire[lit=true]');
  pairs([x1 - 1], [z1 + 1, z2 - 1]).forEach(([x, z]) => w.set(x, BASE, z, 'dead_bush'));
  pairs([x1 - 1], [z1 + 1, z2 - 1]).forEach(([x, z]) => w.set(x, GROUND, z, 'podzol'));
  // Grabsteine vor der Südseite
  const graves = [x1 + 1.5, x1 + 3.5, x1 + 5.5, x1 + 7.5].flatMap((gx, i) => {
    const gz = z2 + 1.6 + (i % 2) * 0.5;
    return [
      blockDisplay(tag('ruine'), [gx, BASE + 0.45, gz], i % 2 === 0 ? 'mossy_stone_bricks' : 'cobblestone', {
        scale: [0.7, 0.9, 0.2],
        rotation: aroundY(0.08 * (i - 1.5)),
      }),
      blockDisplay(tag('ruine'), [gx, BASE + 0.05, gz + 0.75], 'podzol', { scale: [0.8, 0.1, 1.1] }),
    ];
  });
  // Gespenster aus Laken neben der Ruine
  const ghost = (at: Vec, yaw: number): string[] =>
    placeModel(tag('geist'), at, yaw, [
      { at: [0, 0.55, 0], block: 'white_concrete', scale: [0.62, 1.1, 0.5] },
      { at: [0, 1.32, 0], block: 'white_wool', scale: [0.56, 0.5, 0.48] },
      { at: [-0.12, 1.36, 0.245], block: 'black_concrete', scale: [0.1, 0.14, 0.02] },
      { at: [0.12, 1.36, 0.245], block: 'black_concrete', scale: [0.1, 0.14, 0.02] },
      { at: [0, 1.18, 0.245], block: 'black_concrete', scale: [0.14, 0.08, 0.02] },
      { at: [0.38, 0.75, 0.05], block: 'white_wool', scale: [0.16, 0.4, 0.16] },
      { at: [-0.38, 0.75, 0.05], block: 'white_wool', scale: [0.16, 0.4, 0.16] },
    ]);
  const ghosts = (
    [
      [x1 - 4.5, BASE, z1 + 2.5, Math.PI / 2 + 0.3],
      [x2 + 2.5, BASE, z2 - 1.5, -Math.PI / 2],
    ] as const
  ).flatMap(([x, y, z, yaw]) => settle(world, [x, y, z], (p) => ghost(p, yaw), 2) ?? []);
  // Tafel an der Westmauer neben der Tür (wo die Mauer hoch genug steht)
  const signZ =
    range(z1 + 1, z2 - 1).find((z) => Math.abs(z - midZ) > 1 && stones.has(w.get(x1, BASE + 2, z) ?? '')) ??
    z1;
  const sign = textSign(
    tag('ruine'),
    [x1 - 0.04, BASE + 2.5, signZ + HALF],
    -90,
    [
      { text: 'Alte Kapelle\\n', color: 'dark_purple', bold: true },
      { text: 'Old chapel', color: 'gray' },
    ],
    0.8,
  );
  return [...graves, ...ghosts, sign];
}

// ---------- Gruselmarkt und Eingang ----------

function eingang(w: Canvas): string[] {
  const { x1, x2, z, beam } = gateFrame(w, {
    post: 'stripped_dark_oak_log',
    beam: 'dark_oak_planks',
    height: 5,
  });
  w.set(x1, beam + 1, z, 'jack_o_lantern[facing=south]');
  w.set(x2, beam + 1, z, 'jack_o_lantern[facing=south]');
  w.set(Math.round((x1 + x2) / 2), beam + 1, z, 'carved_pumpkin[facing=south]');
  const lights = bulbs(
    S,
    'eingang',
    [x1 + 1.02, beam - 0.08, z + 1.06],
    [x2 - 0.02, beam - 0.08, z + 1.06],
    0.45,
    GRUSEL,
  );
  const sign = gateSign(S, beam, z, [
    { text: 'Halloween im Dorf\\n', color: 'gold', bold: true },
    { text: 'Halloween in the village', color: 'light_purple' },
  ]);
  return [...lights, sign];
}

function buden(w: Canvas, v: View): string[] {
  const suppe = budeGeruest(w, v, 0, 'dark_oak', 'dark_oak_planks');
  suppe.set(1, 1, 1, 'barrel[facing=up]');
  suppe.set(2, 1, 1, 'water_cauldron[level=3]');
  suppe.set(3, 1, 1, 'barrel[facing=up]');
  suppe.set(2, 4, 1, 'light[level=12]');
  const schalen = [1.4, 2.5, 3.6].map((u) =>
    itemDisplay(tag('bude'), pointAt(suppe, u, 3.04, 0.5), 'pumpkin_pie', 0.4, aroundY(Math.PI / 2)),
  );
  const suess = budeGeruest(w, v, 1, 'dark_oak', 'dark_oak_planks');
  [1, 2, 3].forEach((u) => suess.set(u, 1, 1, 'barrel[facing=up]'));
  suess.set(2, 4, 1, 'light[level=12]');
  const naschzeug = ['cookie', 'sweet_berries', 'cookie', 'glow_berries', 'cookie'].map((item, i) =>
    itemDisplay(tag('bude'), pointAt(suess, 1.2 + i * 0.65, 3.04, 0.5), item, 0.32, aroundY(Math.PI / 2)),
  );
  const girlanden = [suppe, suess].flatMap((f) => budeGarland(S, f, { block: 'dark_oak_leaves' }, GRUSEL));
  return [
    budeSign(S, suppe, [
      { text: 'Kürbissuppe\\n', color: 'gold', bold: true },
      { text: 'Pumpkin soup', color: 'white' },
    ]),
    budeSign(S, suess, [
      { text: 'Süßes oder Saures\\n', color: 'gold', bold: true },
      { text: 'Trick or treat', color: 'white' },
    ]),
    ...schalen,
    ...naschzeug,
    ...girlanden,
  ];
}

function lichterRing(): string[] {
  return ringPairs().flatMap(([a, b]) => {
    const gap = Math.hypot(b[0] - a[0], b[2] - a[2]);
    return bulbs(
      S,
      'kette',
      [a[0], a[1] - 0.05, a[2]],
      [b[0], b[1] - 0.05, b[2]],
      Math.min(1.3, 0.35 + gap * 0.08),
      GRUSEL,
    );
  });
}

// ---------- Alles zusammen ----------

const cache: { base?: Canvas; plan?: SeasonPlan } = {};

/** Halloween-Plan über dem Bauplan der Lobby (Blöcke mit Rückweg, Anzeigen). */
export function halloweenPlan(base: Canvas): SeasonPlan {
  if (cache.base === base && cache.plan) return cache.plan;
  const w = new Canvas();
  const v = viewOf(base, w);
  const world: World = (x, y, z) => v.now(x, y, z);
  riesenkuerbis(w, v);
  const displays = [
    ...kuerbisfeld(w, v),
    ...ruine(w, v, world),
    ...eingang(w),
    ...buden(w, v),
    ...lichterRing(),
  ];
  const c = `${CHRISTBAUM.x + HALF} ${BASE} ${CHRISTBAUM.z + HALF}`;
  const moves = [
    `execute as @e[type=mannequin,tag=mm_walker,x=${CHRISTBAUM.x + HALF},y=${BASE},z=${CHRISTBAUM.z + HALF},distance=..${RIESENKUERBIS.r + 1.5}] at @s ` +
      `facing ${c} run tp @s ^ ^ ^-5`,
  ];
  const plan = seasonPlanOf(v, w, displays, moves);
  cache.base = base;
  cache.plan = plan;
  return plan;
}
