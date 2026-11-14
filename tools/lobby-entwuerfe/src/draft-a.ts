/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: block offsets as the build needs them */
/**
 * Entwurf A – „Dorfplatz am Schlossberg“: runder Dorfplatz mit Maibaum, Prachtstraße hinauf zum Schloss auf dem
 * Hügel, Portale links und rechts der Achse, Dorfstraße mit Alpenhäusern bis zur Kapelle, Biergarten mit Wirtshaus,
 * Obstgarten, Felder und Teich, ringsum Alpengipfel mit Schnee.
 */
import {
  biergarten,
  Canvas,
  castle,
  chapel,
  disc,
  discAt,
  fbm,
  GROUND,
  launchpad,
  maypole,
  meadow,
  path,
  pick,
  random,
  range,
  roundTree,
  terrain,
} from '@moinmorni/builder';
import { fence, field, forest, houseAt, lampPost, MODES, mountains, portalAt, ramp } from './common.js';

export const A = { cx: 0, cz: 0, name: 'Dorfplatz am Schlossberg' };

const HILL = { x: 0, z: -119, top: 44, foot: 92, height: 26 };
const PAVING = ['stone_bricks', 'cobblestone', 'polished_andesite', 'andesite', 'stone_bricks', 'mossy_cobblestone'];
const POND = { x: -62, z: 34, r: 11 };

/** Aussichtspunkte für die Bilder: Name, Kamera, Blickziel. */
export const VIEWS_A = [
  '1-ankunft 9.5 65 12.5 @ 0 92 -120',
  '2-portale -12 65 -12 @ -40 70 -30',
  '3-von-oben 75 148 45 @ 0 78 -75',
  '4-biergarten 30 66 26 @ 50 66 -6',
  '5-schloss 17 92 -104 @ 0 104 -140',
  '6-dorfstrasse 0.5 66 100 @ 0 70 20',
];

export function draftA(): { canvas: Canvas; height: (x: number, z: number) => number } {
  const c = new Canvas();
  const rnd = random(4711);
  const mtn = mountains(101, A.cx, A.cz, 128, 205, 118);
  const height = (x: number, z: number): number => {
    const hill = HILL.height * (1 - ramp(Math.hypot(x - HILL.x, z - HILL.z), HILL.top, HILL.foot));
    const roll = Math.max(0, ramp(Math.hypot(x, z), 128, 160) * 7 * (fbm(5, x, z, 26, 2) - 0.35));
    const pond = Math.hypot(x - POND.x, z - POND.z) < POND.r ? -3 : 0;
    return Math.round(GROUND + Math.max(hill, mtn(x, z)) + roll + pond);
  };
  terrain(c, { x1: -215, z1: -215, x2: 215, z2: 215, height, snowLine: 150, seed: 101, skipFlat: true, waterLevel: GROUND - 1 });

  // Dorfplatz: Kopfsteinpflaster, Rand mit Laternen, Maibaum
  discAt(c, 0, GROUND, 0, 22, () => pick(rnd, PAVING));
  disc(0, 0, 22.6).filter(([x, z]) => Math.hypot(x, z) > 21.5).forEach(([x, z]) => c.set(x, GROUND, z, 'polished_andesite'));
  range(0, 13).forEach((i) => {
    const a = (i / 14) * Math.PI * 2;
    const [lx, lz] = [Math.round(Math.cos(a) * 23.5), Math.round(Math.sin(a) * 23.5)];
    if (Math.abs(lx) > 5) lampPost(c, lx, GROUND, lz);
  });
  maypole(c, 0, GROUND, 0, 30);

  // Prachtstraße zum Schloss (Achse x = 0), Portale links und rechts
  range(-5, 5).forEach((x) => range(-82, -22).forEach((z) => c.set(x, Math.max(GROUND, Math.round(height(x, z))), z, Math.abs(x) === 5 ? 'polished_andesite' : pick(rnd, PAVING))));
  range(-80, -24).filter((z) => z % 8 === 0).forEach((z) => [-6, 6].forEach((x) => lampPost(c, x, Math.max(GROUND, Math.round(height(x, z))), z)));
  range(-50, 50).forEach((x) => range(-38, -23).forEach((z) => c.set(x, GROUND, z, pick(rnd, PAVING))));
  [-42, -24, 24, 42].forEach((x, i) => portalAt(c, x, GROUND, -32, 'south', MODES[i]!));
  range(-46, -30).forEach((x) => range(-20, 20).forEach((z) => c.set(x, GROUND, z, pick(rnd, PAVING))));
  [-14, 0, 14].forEach((z, i) => portalAt(c, -38, GROUND, z, 'east', MODES[4 + i]!));

  // Dorfstraße nach Süden mit Häusern auf beiden Seiten, Kapelle am Ende
  range(-3, 3).forEach((x) => range(22, 104).forEach((z) => c.set(x, GROUND, z, Math.abs(x) === 3 ? 'stone_bricks' : pick(rnd, ['gravel', 'cobblestone', 'gravel', 'coarse_dirt']))));
  [32, 50, 68, 86].forEach((z, i) => {
    houseAt(c, -10, GROUND, z, 'east', 11, 11, 2 + (i % 2), rnd);
    houseAt(c, 10, GROUND, z + 6, 'west', 11, 11, 3 - (i % 2), rnd, i % 2 === 0 ? 'spruce' : 'dark_oak');
    fence(c, -26, z - 7, -15, z + 7, GROUND + 1);
    fence(c, 15, z - 1, 26, z + 13, GROUND + 1);
    roundTree(c, -21, GROUND + 1, z, { height: 8, radius: 3, leaves: 'oak_leaves', rnd });
  });
  chapel(c, -4, GROUND, 108, 'north');
  houseAt(c, -30, GROUND, 30, 'north', 11, 11, 3, rnd);
  houseAt(c, 30, GROUND, 30, 'north', 9, 10, 2, rnd);

  // Biergarten im Osten mit Wirtshaus
  biergarten(c, 30, -16, 60, 16, GROUND, rnd);
  houseAt(c, 72, GROUND, 0, 'west', 15, 13, 3, rnd);

  // Obstgarten, Felder, Teich
  range(0, 4).forEach((i) => range(0, 3).forEach((j) => roundTree(c, 40 + i * 9, GROUND + 1, 44 + j * 10, { height: 7, radius: 2.6, leaves: (i + j) % 3 === 0 ? 'flowering_azalea_leaves' : 'oak_leaves', rnd })));
  field(c, 40, 82, 70, 98, GROUND);
  field(c, -60, 70, -36, 96, GROUND, 'carrots[age=7]');
  fence(c, -61, 69, -35, 97, GROUND + 1, [-48, 69]);
  disc(POND.x, POND.z, POND.r + 1.5).filter(([x, z]) => Math.hypot(x - POND.x, z - POND.z) >= POND.r).forEach(([x, z]) => c.set(x, GROUND + 1, z, rnd() < 0.3 ? 'sugar_cane' : 'short_grass'));

  // Schloss auf dem Hügel, Freitreppe nach Süden
  castle(c, { x: 0, y: GROUND + HILL.height, z: -96, front: 'south', wallDrop: 14, rnd });
  launchpad(c, -14, GROUND, -26);
  launchpad(c, 14, GROUND, -26);
  // Parkour vom Westhang zum Schloss: schwebende Smaragd- und Goldblöcke
  range(0, 15).forEach((i) => c.set(-70 + i * 3, GROUND + 4 + i * 2, -50 - i * 3 - (i % 2) * 2, i % 2 === 0 ? 'emerald_block' : 'gold_block'));

  const pathBlocks = ['gravel', 'coarse_dirt', 'gravel', 'cobblestone'];
  path(c, [[50, 16], [62, 40], [62, 70]], 3, (x, z) => height(x, z), () => pick(rnd, pathBlocks));
  path(c, [[-46, 20], [-50, 40], [-48, 68]], 3, (x, z) => height(x, z), () => pick(rnd, pathBlocks));

  const castleArea = (x: number, z: number): boolean => Math.abs(x) < 42 && z < -78 && z > -168;
  forest(c, -215, -215, 215, 215, height, (x, z, h) => {
    const d = Math.hypot(x, z);
    const onHill = Math.hypot(x - HILL.x, z - HILL.z) < HILL.top + 6;
    return h < 150 && !onHill && !castleArea(x, z) && d > 112;
  }, 101, rnd);
  forest(c, -100, -100, 100, 120, height, (x, z, h) => {
    const nearHill = Math.hypot(x - HILL.x, z - HILL.z);
    return nearHill > HILL.top + 6 && nearHill < HILL.foot && Math.abs(x) > 14 && h > GROUND + 2 && !castleArea(x, z);
  }, 202, rnd);
  meadow(c, -125, -125, 125, 125, height, 0.16, rnd);
  return { canvas: c, height };
}
