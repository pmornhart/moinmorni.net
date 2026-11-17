/* eslint-disable ts-patterns/no-magic-numbers -- positions in the lobby */
import { describe, expect, it } from 'vitest';
import { baseName } from '../src/canvas.js';
import { GROUND } from '../src/nature.js';
import { range } from '../src/range.js';
import { buildLobby } from '../src/lobby/dorfplatz.js';
import { CARPET_FROM_Z, PORTAL_HALF, PORTAL_Z, RUNNER_HALF, VORPLATZ } from '../src/lobby/schlosstreppe.js';
import { collisionOf } from '../src/lobby/walk.js';

/** Bis hierher (ins Schloss hinein) reicht der Teppich: Schlosstor bei z −96, dann neun Reihen in den Ehrenhof. */
const CARPET_TO_Z = -105;
/** Rand von Schlossmarkt, Schlosstreppe und Vorplatz – hier darf keine nackte Erde zu sehen sein. */
const EDGE = { x1: -60, x2: 60, z1: -100, z2: -18, y1: GROUND, y2: 112 };
/** Durch diese Blöcke sieht man hindurch (Teile des Namens). */
const SEE_THROUGH = [
  'glass',
  'leaves',
  '_fence',
  '_wall',
  'bars',
  'pane',
  'lantern',
  'slab',
  'stairs',
  'carpet',
  'potted_',
  'chain',
  'trapdoor',
  'door',
  'candle',
];
/** Nackte Erde. */
const BARE: ReadonlySet<string> = new Set(['dirt', 'coarse_dirt', 'rooted_dirt', 'grundwelt']);
/** Gebautes (Teile des Namens). */
const BUILT = [
  'stone_brick',
  'quartz',
  'polished',
  'chiseled',
  'cobble',
  'diorite',
  '_planks',
  '_log',
  'concrete',
  'gold_block',
];
const NEIGHBOURS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;
const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

describe('Prunkeingang zum Schloss', () => {
  const { canvas } = buildLobby();
  const at = (x: number, y: number, z: number): string =>
    canvas.get(x, y, z) ?? (y <= GROUND ? 'grundwelt' : 'air');

  it('der rote Teppich läuft ohne Lücke vom Dorfplatz über Stufen und Vorplatz durchs Schlosstor', () => {
    const red = (block: string): boolean =>
      block === 'red_carpet' || baseName(block) === 'red_nether_brick_stairs';
    const gaps = range(CARPET_TO_Z, CARPET_FROM_Z).filter(
      (z) => !range(GROUND, 100).some((y) => red(at(RUNNER_HALF, y, z)) && red(at(-RUNNER_HALF, y, z))),
    );
    expect(gaps).toEqual([]);
  });

  it('das Portal steht auf dem Schlossmarkt: Wappen, Fahnen, Säulen – und lässt die Straße frei', () => {
    const near = canvas
      .find(() => true)
      .filter(([x, , z]) => Math.abs(x) <= PORTAL_HALF && z >= PORTAL_Z && z <= PORTAL_Z + 1);
    const names = near.map(([, , , b]) => baseName(b));
    expect(names.filter((n) => n === 'emerald_block').length).toBeGreaterThan(5);
    expect(names.filter((n) => n.endsWith('_banner')).length).toBeGreaterThanOrEqual(4);
    expect(names.filter((n) => n === 'quartz_pillar').length).toBeGreaterThan(10);
    // Im Durchgang (x −5 … 5) ist bis 7 Blöcke über dem Boden nur Luft, Teppich und der Kronleuchter oben
    range(-5, 5).forEach((x) =>
      range(GROUND + 1, GROUND + 3).forEach((y) =>
        [PORTAL_Z, PORTAL_Z + 1].forEach((z) =>
          expect(collisionOf(at(x, y, z)) ?? [0, 0], `${x} ${y} ${z}`).toEqual(
            baseName(at(x, y, z)) === 'red_carpet' ? [0, 1 / 16] : [0, 0],
          ),
        ),
      ),
    );
  });

  it('Fahnen am Vorplatz und an den Podesten', () => {
    const flags = canvas.find((b) => b.includes('_banner[rotation='));
    const onPlaza = flags.filter(([, y, z]) => z >= VORPLATZ.z1 && z <= VORPLATZ.z2 && y > VORPLATZ.y);
    const atStairs = flags.filter(([x, , z]) => Math.abs(x) <= 12 && z < -38 && z > VORPLATZ.z2);
    expect(onPlaza.length).toBeGreaterThanOrEqual(8);
    expect(atStairs.length).toBe(6);
  });

  it('am Rand von Schlossmarkt, Schlosstreppe und Vorplatz ist keine nackte Erde zu sehen (Philip: Erdwand)', () => {
    const { x1, x2, z1, z2, y1, y2 } = EDGE;
    const [ny, nz] = [y2 - y1 + 1, z2 - z1 + 1];
    const index = (x: number, y: number, z: number): number => ((x - x1) * ny + (y - y1)) * nz + (z - z1);
    const cell = (i: number): readonly [number, number, number] => [
      x1 + Math.floor(i / (ny * nz)),
      y1 + (Math.floor(i / nz) % ny),
      z1 + (i % nz),
    ];
    const inside = (x: number, y: number, z: number): boolean =>
      x >= x1 && x <= x2 && y >= y1 && y <= y2 && z >= z1 && z <= z2;
    /** Sieht man durch den Block hindurch (Luft, Pflanzen, Zäune, Glas, Laub …)? */
    const open = (b: string): boolean =>
      collisionOf(b) === undefined || SEE_THROUGH.some((part) => baseName(b).includes(part));
    // Außenluft: von oben über alles, was man durchschauen kann (Schicht für Schicht)
    const outside = new Uint8Array((x2 - x1 + 1) * ny * nz);
    const seeds = range(x1, x2).flatMap((x) => range(z1, z2).map((z) => index(x, y2, z)));
    seeds.forEach((i) => (outside[i] = 1));
    const spread = (frontier: readonly number[]): void => {
      if (frontier.length === 0) return;
      const next = frontier.flatMap((i) => {
        const [x, y, z] = cell(i);
        return NEIGHBOURS.flatMap(([dx, dy, dz]) => {
          const [ax, ay, az] = [x + dx, y + dy, z + dz];
          if (!inside(ax, ay, az)) return [];
          const j = index(ax, ay, az);
          if (outside[j] === 1 || !open(at(ax, ay, az))) return [];
          outside[j] = 1;
          return [j];
        });
      });
      spread(next);
    };
    spread(seeds);
    const seen = (x: number, y: number, z: number): boolean =>
      SIDES.some(([dx, dz]) => inside(x + dx, y, z + dz) && outside[index(x + dx, y, z + dz)] === 1);
    const nearBuilt = (x: number, y: number, z: number): boolean =>
      range(-2, 2).some((dx) =>
        range(-2, 2).some((dz) =>
          range(-1, 2).some((dy) => BUILT.some((part) => at(x + dx, y + dy, z + dz).includes(part))),
        ),
      );
    const found = range(x1, x2).flatMap((x) =>
      range(z1, z2).flatMap((z) =>
        range(y1, 100)
          .filter((y) => BARE.has(baseName(at(x, y, z))) && seen(x, y, z))
          // nur dort, wo gebaut ist (Wege, Mauern, Treppen) – die Hänge des Schlossbergs dürfen Erde zeigen
          .filter((y) => nearBuilt(x, y, z))
          .map((y) => `${x} ${y} ${z}`),
      ),
    );
    expect(found).toEqual([]);
  }, 60_000);
});
