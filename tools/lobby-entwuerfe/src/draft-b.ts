/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: block offsets as the build needs them */
/**
 * Entwurf B – „Schlossinsel im Smaragdsee“: türkisgrüner Bergsee, das Schloss auf einer Felsinsel, eine Steinbrücke
 * mit Laternen, Seepromenade mit den Portalen, Dorf dahinter, Biergarten am Ostufer, Bootshäuser am Westufer,
 * Felswände, die im Norden direkt in den See fallen.
 */
import {
  biergarten,
  biomeCommands,
  Canvas,
  chapel,
  cylinder,
  discAt,
  fbm,
  GROUND,
  lathe,
  launchpad,
  maypole,
  meadow,
  onionTower,
  pairs,
  palaceWing,
  pick,
  random,
  range,
  roundTree,
  slab,
  terrain,
} from '@moinmorni/builder';
import { fence, forest, houseAt, lampPost, MODES, portalAt, ramp } from './common.js';

const CX = 600;
export const B = { cx: CX, cz: 0, name: 'Schlossinsel im Smaragdsee' };

const LAKE = { x: CX, z: -40, rx: 88, rz: 62, shore: 18 };
const ISLAND = { x: CX, z: -42, r: 27, top: 20 };
const WATER = GROUND - 1;
const DECK = GROUND;
const PAVING = ['stone_bricks', 'polished_andesite', 'stone_bricks', 'andesite', 'cobblestone'];

export const VIEWS_B = [
  `1-ankunft ${CX + 6.5} 69 40.5 @ ${CX} 80 -45`,
  `2-portale ${CX - 22} 65 33 @ ${CX - 50} 70 20`,
  `3-von-oben ${CX + 90} 140 70 @ ${CX} 70 -40`,
  `4-biergarten ${CX + 62} 66 22 @ ${CX + 80} 66 -4`,
  `5-schloss ${CX + 16} 70 -6 @ ${CX} 90 -45`,
  `6-promenade ${CX + 60} 65 26 @ ${CX - 20} 70 18`,
];

/** Abstand zum Seerand (0 = Ufer, < 0 = im See); das Südufer ist gerade (Promenade). */
function lakeDepth(x: number, z: number): number {
  const e = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
  return z > LAKE.shore ? 1 : e - 1;
}

/** Inselschloss: vier Flügel nach außen, vier Ecktürme, große Mittelkuppel. */
function islandCastle(c: Canvas, cx: number, y: number, cz: number): void {
  const h = 12;
  palaceWing(c, { x: cx - h, y, z: cz + h, front: 'south', width: 2 * h + 1, depth: 9, storeys: 3 });
  palaceWing(c, { x: cx + h, y, z: cz - h, front: 'north', width: 2 * h + 1, depth: 9, storeys: 3 });
  palaceWing(c, { x: cx + h, y, z: cz + h, front: 'east', width: 2 * h + 1, depth: 9, storeys: 3 });
  palaceWing(c, { x: cx - h, y, z: cz - h, front: 'west', width: 2 * h + 1, depth: 9, storeys: 3 });
  [
    [-h - 1, -h - 1],
    [h + 1, -h - 1],
    [-h - 1, h + 1],
    [h + 1, h + 1],
  ].forEach(([dx = 0, dz = 0]) => onionTower(c, cx + dx, y, cz + dz, 5, 28));
  cylinder(c, cx, cz, y + 16, y + 24, 7, 'white_concrete');
  discAt(c, cx, y + 25, cz, 8, 'smooth_quartz');
  lathe(c, cx, y + 26, cz, [7, 8, 8, 8, 7, 7, 6, 5, 4, 3, 2, 1, 1], 'waxed_oxidized_copper');
  range(y + 39, y + 41).forEach((ty) => c.set(cx, ty, cz, 'gold_block'));
  c.set(cx, y + 42, cz, 'lightning_rod');
}

export function draftB(): { canvas: Canvas; height: (x: number, z: number) => number } {
  const c = new Canvas();
  const rnd = random(1848);
  /** Berge: im Norden fast direkt am See, im Süden erst hinter dem Dorf. */
  const mountainsAt = (x: number, z: number): number => {
    const dx = x - LAKE.x;
    const dz = z - LAKE.z;
    const e = Math.hypot(dx / 125, dz / (dz < 0 ? 66 : 150));
    const ring = ramp(e, 1.04, 2.3);
    const ridge = 1 - Math.abs(2 * fbm(202, x, z, 60, 4) - 1);
    return ring * 130 * (0.3 + 0.7 * ridge ** 1.6) + ring * 14 * fbm(203, x, z, 15, 3);
  };
  const height = (x: number, z: number): number => {
    const isl = Math.hypot(x - ISLAND.x, z - ISLAND.z);
    if (isl < ISLAND.r)
      return Math.round(WATER - 6 + (1 - ramp(isl, ISLAND.r - 8, ISLAND.r)) * (ISLAND.top - 7));
    const ld = lakeDepth(x, z);
    if (ld < 0) return Math.round(WATER - Math.min(9, 2 + -ld * 18) + mountainsAt(x, z));
    return Math.round(GROUND + mountainsAt(x, z));
  };
  terrain(c, {
    x1: CX - 215,
    z1: -215,
    x2: CX + 215,
    z2: 215,
    height,
    snowLine: 152,
    seed: 202,
    skipFlat: true,
    waterLevel: WATER,
    lakeBed: ['sand', 'gravel', 'clay', 'sand', 'gravel'],
  });
  c.extra.push(...biomeCommands(CX - 92, 40, -106, CX + 92, 74, 22, 'minecraft:mangrove_swamp'));

  // Inselplateau mit Mauer und Schloss
  const top = GROUND + ISLAND.top - 14;
  discAt(c, ISLAND.x, top, ISLAND.z, 22, (x, z) =>
    (x + z) % 3 === 0 ? 'polished_diorite' : 'polished_andesite',
  );
  pairs(range(ISLAND.x - 23, ISLAND.x + 23), range(ISLAND.z - 23, ISLAND.z + 23))
    .filter(([x, z]) => Math.abs(Math.hypot(x - ISLAND.x, z - ISLAND.z) - 22.5) < 0.7)
    .forEach(([x, z]) => {
      range(WATER - 2, top).forEach((y) =>
        c.set(x, y, z, rnd() < 0.2 ? 'mossy_stone_bricks' : 'stone_bricks'),
      );
      c.set(x, top + 1, z, (x + z) % 2 === 0 ? 'stone_brick_wall' : 'air');
    });
  islandCastle(c, ISLAND.x, top + 1, ISLAND.z);

  // Brücke vom Südufer zur Insel: flach auf Höhe der Promenade, an der Insel eine Treppe hinauf
  const wall = ISLAND.z + 22;
  const stepsFrom = wall + (top - DECK);
  range(wall, LAKE.shore).forEach((z) => {
    const deck = z < stepsFrom ? DECK + (stepsFrom - z) : DECK;
    range(CX - 3, CX + 3).forEach((x) => {
      const edge = Math.abs(x - CX) === 3;
      const stepBlock = z < stepsFrom && !edge ? 'stone_brick_stairs[facing=north]' : null;
      c.set(x, deck, z, stepBlock ?? (edge ? 'stone_bricks' : pick(rnd, PAVING)));
      range(WATER - 6, deck - 1)
        .filter(() => z % 8 === 0 || z < stepsFrom)
        .forEach((y) => c.set(x, y, z, 'stone_bricks'));
    });
    [CX - 3, CX + 3].forEach((x) => c.set(x, deck + 1, z, z % 8 === 0 ? 'stone_bricks' : 'stone_brick_wall'));
    if (z % 8 === 0)
      [CX - 3, CX + 3].forEach((x) => {
        range(deck + 2, deck + 3).forEach((y) => c.set(x, y, z, 'dark_oak_fence'));
        c.set(x, deck + 4, z, 'lantern');
      });
  });
  range(CX - 3, CX + 3).forEach((x) => range(top + 1, top + 3).forEach((y) => c.set(x, y, wall, 'air')));

  // Seepromenade mit Portalen, Startpunkt in der Mitte
  range(CX - 96, CX + 96).forEach((x) =>
    range(LAKE.shore + 1, LAKE.shore + 14).forEach((z) =>
      c.set(x, GROUND, z, z === LAKE.shore + 1 ? 'stone_bricks' : pick(rnd, PAVING)),
    ),
  );
  range(CX - 96, CX + 96).forEach((x) =>
    c.set(x, GROUND + 1, LAKE.shore + 1, x % 6 === 0 ? 'stone_bricks' : 'stone_brick_wall'),
  );
  range(CX - 96, CX + 96)
    .filter((x) => x % 12 === 0)
    .forEach((x) => lampPost(c, x, GROUND, LAKE.shore + 2));
  [-72, -50, -28, 28, 50, 72].forEach((dx, i) =>
    portalAt(c, CX + dx, GROUND, LAKE.shore + 9, 'north', MODES[i]!),
  );
  // Aussichtsterrasse mit Maibaum hinter der Promenade, Treppe hinunter
  const terrace = GROUND + 4;
  pairs(range(CX - 14, CX + 14), range(LAKE.shore + 16, LAKE.shore + 38)).forEach(([x, z]) => {
    range(GROUND, terrace - 1).forEach((y) => c.set(x, y, z, 'stone_bricks'));
    c.set(x, terrace, z, pick(rnd, PAVING));
    const edge = x === CX - 14 || x === CX + 14 || z === LAKE.shore + 16 || z === LAKE.shore + 38;
    if (edge && !(z === LAKE.shore + 16 && Math.abs(x - CX) <= 3))
      c.set(x, terrace + 1, z, (x + z) % 4 === 0 ? 'stone_bricks' : 'stone_brick_wall');
  });
  range(1, 4).forEach((i) =>
    range(CX - 3, CX + 3).forEach((x) =>
      c.set(x, terrace - i, LAKE.shore + 16 - i, 'stone_brick_stairs[facing=south]'),
    ),
  );
  [
    [-14, 16],
    [14, 16],
    [-14, 38],
    [14, 38],
  ].forEach(([dx = 0, dz = 0]) => lampPost(c, CX + dx, terrace + 1, LAKE.shore + dz));
  maypole(c, CX, terrace, LAKE.shore + 28, 30);
  portalAt(c, CX, GROUND, 66, 'north', MODES[6]!);
  launchpad(c, CX - 10, GROUND, 30);
  launchpad(c, CX + 10, GROUND, 30);

  // Dorf hinter der Promenade
  [-60, -40, 40, 60].forEach((dx, i) => houseAt(c, CX + dx, GROUND, 44, 'north', 11, 11, 2 + (i % 2), rnd));
  [-60, -40, 40, 60].forEach((dx, i) =>
    houseAt(c, CX + dx, GROUND, 74, 'south', 9, 10, 3 - (i % 2), rnd, 'spruce'),
  );
  range(CX - 70, CX + 70).forEach((x) =>
    range(58, 62).forEach((z) => c.set(x, GROUND, z, pick(rnd, ['gravel', 'cobblestone', 'coarse_dirt']))),
  );
  chapel(c, CX - 90, GROUND, 52, 'east');

  // Biergarten am Ostufer, Wirtshaus
  biergarten(c, CX + 64, -14, CX + 92, 14, GROUND, rnd);
  houseAt(c, CX + 104, GROUND, 0, 'west', 15, 13, 3, rnd);

  // Bootshäuser und Stege am Westufer
  [
    [-78, -8],
    [-70, -26],
  ].forEach(([dx = 0, dz = 0]) => {
    const bx = CX + dx;
    range(bx - 3, bx + 3).forEach((x) =>
      range(dz - 4, dz + 4).forEach((z) => c.set(x, WATER + 1, z, 'spruce_planks')),
    );
    range(bx - 3, bx + 3).forEach((x) =>
      [dz - 4, dz + 4].forEach((z) =>
        range(WATER + 2, WATER + 4).forEach((y) => c.set(x, y, z, 'spruce_planks')),
      ),
    );
    range(dz - 5, dz + 5).forEach((z) =>
      range(bx - 4, bx + 4).forEach((x) =>
        c.set(x, WATER + 5 + Math.floor(4 - Math.abs(x - bx) / 1.2), z, slab('dark_oak')),
      ),
    );
    range(bx + 4, bx + 14).forEach((x) => c.set(x, WATER + 1, dz, 'spruce_planks'));
  });

  fence(c, CX - 30, 80, CX - 10, 96, GROUND + 1);
  range(0, 4).forEach((i) => roundTree(c, CX + 20 + i * 8, GROUND + 1, 90, { height: 8, radius: 3, rnd }));
  forest(
    c,
    CX - 215,
    -215,
    CX + 215,
    215,
    height,
    (x, z, h) => {
      const d = Math.hypot(x - LAKE.x, z - LAKE.z);
      return h < 150 && h > WATER && lakeDepth(x, z) > 0.12 && (d > 100 || z > 110) && Math.abs(x - CX) > 18;
    },
    202,
    rnd,
  );
  meadow(c, CX - 130, -130, CX + 130, 130, height, 0.15, rnd);
  return { canvas: c, height };
}
