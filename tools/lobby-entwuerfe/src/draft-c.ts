/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: block offsets as the build needs them */
/**
 * Entwurf C – „Bergschloss mit Terrassen“: das Dorf staffelt sich in Terrassen den Hang hinauf, Stützmauern aus
 * Stein, eine breite Mitteltreppe, Portale auf den Terrassen, Biergarten mit Talblick, oben das Schloss.
 * Dazu eine Seilbahn vom Dorfplatz zum Schloss und ein Teich auf der ersten Terrasse.
 */
import {
  biergarten,
  Canvas,
  castle,
  fbm,
  GROUND,
  launchpad,
  maypole,
  meadow,
  pairs,
  pick,
  random,
  range,
  roundTree,
  terrain,
} from '@moinmorni/builder';
import { fence, forest, houseAt, lampPost, MODES, portalAt, ramp } from './common.js';

const CX = 1200;
export const C = { cx: CX, cz: 0, name: 'Bergschloss mit Terrassen' };

/** Terrassen von unten nach oben: gilt, solange z größer als `above` ist. */
const TIERS = [
  { above: -7, y: GROUND },
  { above: -41, y: GROUND + 8 },
  { above: -75, y: GROUND + 16 },
  { above: Number.NEGATIVE_INFINITY, y: GROUND + 26 },
] as const;
const HALF_WIDTH = 76;
const PAVING = ['stone_bricks', 'cobblestone', 'polished_andesite', 'andesite', 'stone_bricks', 'mossy_cobblestone'];

export const VIEWS_C = [
  `1-ankunft ${CX + 17.5} 65 31.5 @ ${CX} 100 -110`,
  `2-portale ${CX + 22} 73 -2 @ ${CX + 45} 78 -14`,
  `3-von-oben ${CX + 95} 150 80 @ ${CX} 80 -60`,
  `4-biergarten ${CX - 30} 81 -44 @ ${CX - 52} 81 -62`,
  `5-schloss ${CX + 14} 92 -84 @ ${CX} 104 -120`,
  `6-talblick ${CX - 10} 93 -80 @ ${CX} 64 40`,
];

function tierY(z: number): number {
  return (TIERS.find((t) => z > t.above) ?? TIERS[TIERS.length - 1]!).y;
}

export function draftC(): { canvas: Canvas; height: (x: number, z: number) => number } {
  const c = new Canvas();
  const rnd = random(1972);
  const height = (x: number, z: number): number => {
    const dx = Math.abs(x - CX);
    const side = ramp(dx, HALF_WIDTH + 2, 160);
    const back = ramp(-(z + 150), 0, 80);
    const front = ramp(z - 60, 0, 120);
    const ring = Math.max(side, back, front);
    const ridge = 1 - Math.abs(2 * fbm(303, x, z, 60, 4) - 1);
    const mtn = ring * 135 * (0.3 + 0.7 * ridge ** 1.6) + ring * 14 * fbm(304, x, z, 15, 3);
    return Math.round(Math.max(tierY(z), GROUND + mtn));
  };
  terrain(c, { x1: CX - 215, z1: -215, x2: CX + 215, z2: 215, height, snowLine: 152, seed: 303, skipFlat: true });

  // Stützmauern mit Brüstung und Mitteltreppen (die oberste Treppe gehört zum Schloss)
  TIERS.slice(0, 2).forEach((lower, i) => {
    const upper = TIERS[i + 1]!;
    const z = lower.above;
    range(CX - HALF_WIDTH, CX + HALF_WIDTH).forEach((x) => {
      range(lower.y, upper.y).forEach((y) => c.set(x, y, z, rnd() < 0.18 ? 'mossy_stone_bricks' : 'stone_bricks'));
      const post = x % 6 === 0 ? 'stone_bricks' : 'stone_brick_wall';
      c.set(x, upper.y + 1, z, Math.abs(x - CX) <= 5 ? 'air' : post);
      if (rnd() < 0.06) range(lower.y + 1, upper.y - 2).forEach((y) => c.set(x, y, z + 1, 'vine[north=true]'));
    });
    range(1, upper.y - lower.y).forEach((step) => range(CX - 4, CX + 4).forEach((x) => {
      c.set(x, lower.y + step, z + 1 - step, 'stone_brick_stairs[facing=north]');
      range(lower.y + step + 1, upper.y + 2).forEach((y) => c.set(x, y, z + 1 - step, 'air'));
    }));
    [CX - 5, CX + 5].forEach((x) => range(lower.y + 1, upper.y + 1).forEach((y) => c.set(x, y, z + 1 - (y - lower.y), 'stone_brick_wall')));
  });

  // Unten: Dorfplatz mit Maibaum, Häuser zu beiden Seiten
  pairs(range(CX - 24, CX + 24), range(-6, 34)).forEach(([x, z]) => c.set(x, GROUND, z, pick(rnd, PAVING)));
  maypole(c, CX, GROUND, 14, 30);
  [CX - 24, CX + 24].forEach((x) => range(-4, 32).filter((z) => z % 9 === 0).forEach((z) => lampPost(c, x, GROUND, z)));
  [[-36, 4, 'east'], [-36, 24, 'east'], [36, 4, 'west'], [36, 24, 'west']].forEach(([dx, z, f], i) =>
    houseAt(c, CX + Number(dx), GROUND, Number(z), f as 'east' | 'west', 11, 11, 2 + (i % 2), rnd),
  );
  launchpad(c, CX - 12, GROUND, -2);
  launchpad(c, CX + 12, GROUND, -2);

  // Erste Terrasse: Promenade mit vier Portalen, Gärten, Häuser
  const t1 = TIERS[1]!.y;
  pairs(range(CX - HALF_WIDTH + 2, CX + HALF_WIDTH - 2), range(-22, -9)).forEach(([x, z]) => c.set(x, t1, z, pick(rnd, PAVING)));
  [-58, -32, 32, 58].forEach((dx, i) => portalAt(c, CX + dx, t1, -15, 'south', MODES[i]!));
  [[-34, -30], [34, -30]].forEach(([dx = 0, z = 0], i) => houseAt(c, CX + dx, t1, z, 'south', 11, 10, 2 + i, rnd, i === 0 ? 'spruce' : 'dark_oak'));
  fence(c, CX - 20, -38, CX - 8, -26, t1 + 1);
  fence(c, CX + 8, -38, CX + 20, -26, t1 + 1);
  range(0, 3).forEach((i) => roundTree(c, CX - 60 + i * 9, t1 + 1, -34, { height: 8, radius: 3, leaves: 'flowering_azalea_leaves', rnd }));

  // Zweite Terrasse: Biergarten mit Talblick im Westen, drei Portale im Osten
  const t2 = TIERS[2]!.y;
  pairs(range(CX - 6, CX + HALF_WIDTH - 2), range(-56, -43)).forEach(([x, z]) => c.set(x, t2, z, pick(rnd, PAVING)));
  biergarten(c, CX - 72, -70, CX - 40, -45, t2, rnd);
  [24, 46, 66].forEach((dx, i) => portalAt(c, CX + dx, t2, -49, 'south', MODES[4 + i]!));

  // Oben: das Schloss, seine Freitreppe führt hinunter auf die zweite Terrasse
  castle(c, { x: CX, y: TIERS[3]!.y, z: -76, front: 'south', wallDrop: 10, rnd });

  // Seilbahn vom Dorfplatz (Osten) hinauf zum Schloss
  const from = { x: CX + 58, y: GROUND + 9, z: 26 };
  const to = { x: CX + 44, y: TIERS[3]!.y + 12, z: -112 };
  const len = Math.abs(to.z - from.z);
  range(0, len).forEach((i) => {
    const t = i / len;
    c.set(Math.round(from.x + (to.x - from.x) * t), Math.round(from.y + (to.y - from.y) * t), Math.round(from.z + (to.z - from.z) * t), 'iron_chain[axis=z]');
  });
  [0.33, 0.7].forEach((t) => {
    const gx = Math.round(from.x + (to.x - from.x) * t);
    const gy = Math.round(from.y + (to.y - from.y) * t);
    const gz = Math.round(from.z + (to.z - from.z) * t);
    pairs(range(gx - 1, gx + 1), range(gz - 1, gz + 1)).forEach(([x, z]) => {
      c.set(x, gy - 3, z, 'red_concrete');
      c.set(x, gy - 2, z, 'glass');
      c.set(x, gy - 1, z, 'white_concrete');
    });
  });
  pairs(range(from.x - 3, from.x + 3), range(from.z - 3, from.z + 3)).forEach(([x, z]) => {
    range(GROUND + 1, GROUND + 8).forEach((y) => c.set(x, y, z, Math.abs(x - from.x) === 3 || Math.abs(z - from.z) === 3 ? 'spruce_planks' : 'air'));
    c.set(x, GROUND + 9, z, 'dark_oak_planks');
  });
  range(GROUND + 1, GROUND + 3).forEach((y) => c.set(from.x - 3, y, from.z, 'air'));

  // Teich auf der ersten Terrasse (Westseite)
  pairs(range(CX - HALF_WIDTH + 4, CX - HALF_WIDTH + 14), range(-34, -25)).forEach(([x, z]) => c.set(x, TIERS[1]!.y, z, 'water'));

  forest(c, CX - 215, -215, CX + 215, 215, height, (x, z, h) => h < 150 && (Math.abs(x - CX) > HALF_WIDTH + 4 || z < -150 || z > 64), 303, rnd);
  meadow(c, CX - HALF_WIDTH, -140, CX + HALF_WIDTH, 60, height, 0.16, rnd);
  return { canvas: c, height };
}
