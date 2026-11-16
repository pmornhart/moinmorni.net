/* eslint-disable ts-patterns/no-magic-numbers -- positions and distances in the lobby as the build has them */
import { describe, expect, it } from 'vitest';
import { baseName } from '../src/canvas.js';
import { furniturePack } from '../src/furniture.js';
import { GROUND } from '../src/nature.js';
import { pairs, range } from '../src/range.js';
import { KUGELN, kugelModel } from '../src/schmuck.js';
import { MARKET } from '../src/lobby/dorfplatz.js';
import { SEASON_STORAGE, seasonStepsFor } from '../src/lobby/datapack.js';
import { NO_HITBOX } from '../src/lobby/deko.js';
import { BAUM_RADIUS, BAUM_SPITZE, CHRISTBAUM, maibaumBlocks } from '../src/lobby/christbaum.js';
import { LAUNCHPADS, PARKOUR, TOUR } from '../src/lobby/features.js';
import { SCHLOSSMARKT } from '../src/lobby/schlossmarkt.js';
import { SEASONS } from '../src/lobby/season.js';
import { buildLobby } from '../src/lobby/dorfplatz.js';
import { BUDEN, budeArea, krippeArea } from '../src/lobby/weihnachtsmarkt.js';
import { EISBAHN, INNER, kindOf, SCHNEEHAUFEN, winterPlan } from '../src/lobby/winter.js';

const BASE = GROUND + 1;
/** Rechnen dauert (Bauplan + Winter) – die einzelnen Prüfungen sammeln Fehler und vergleichen einmal. */
const SLOW = 60_000;

/** Block vor dem Winter: Bauplan oder Grundwelt (Gras auf 64, darunter Erde, darüber Luft). */
function groundOf(y: number): string {
  if (y > GROUND) return 'air';
  return y === GROUND ? 'grass_block' : 'dirt';
}

/** Abstand eines Punkts zum Rechteck der Eisbahn samt Bande. */
function toRink(x: number, z: number): number {
  const dx = Math.max(EISBAHN.x1 - 1 - x, 0, x - (EISBAHN.x2 + 1));
  const dz = Math.max(EISBAHN.z1 - 1 - z, 0, z - (EISBAHN.z2 + 1));
  return Math.hypot(dx, dz);
}

const toTree = (x: number, z: number): number => Math.hypot(x - CHRISTBAUM.x - 0.5, z - CHRISTBAUM.z - 0.5);

// Figur im Bau: "summon mannequin -7.5 65 14.5 {Tags:[…]}" → -7.5 und 14.5; passt nicht: "summon text_display …".
// https://regex101.com/?flavor=javascript&regex=%5Esummon%20mannequin%20(%5B-%5Cd.%5D%2B)%20%5B-%5Cd.%5D%2B%20(%5B-%5Cd.%5D%2B)%20&testString=summon%20mannequin%20-7.5%2065%2014.5%20%7BTags%3A%5B%5D%7D
const MANNEQUIN = /^summon mannequin ([-\d.]+) [-\d.]+ ([-\d.]+) /;
// Block einer Anzeige: "block_state:{Name:'minecraft:snow_block',id:…" → snow_block; passt nicht: "id:'minecraft:x'".
// https://regex101.com/?flavor=javascript&regex=Name%3A'minecraft%3A(%5Ba-z_%5D%2B)'&testString=block_state%3A%7BName%3A'minecraft%3Asnow_block'%2Cid%3A'minecraft%3Asnow_block'%7D
const DISPLAY_BLOCK = /Name:'minecraft:([a-z_]+)'/;

describe('Winter-Wunderland', () => {
  const { canvas } = buildLobby();
  const plan = winterPlan(canvas);
  const before = (x: number, y: number, z: number): string => canvas.get(x, y, z) ?? groundOf(y);
  const after = (x: number, y: number, z: number): string => plan.blocks.get(x, y, z) ?? before(x, y, z);
  const changed = plan.blocks.find(() => true);
  const figures = canvas.extra
    .map((cmd) => MANNEQUIN.exec(cmd))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => [Number(m[1]), Number(m[2]), m.input.includes("'mm_walker'")] as const);
  /** Wo Buden und Krippe auf dem Boden stehen (ohne Dachüberstand und die Schafe davor). */
  const footprint = [...BUDEN.flatMap((b) => budeArea(b, false)), ...krippeArea(false)];
  /** Samt Dachüberstand und Schafen. */
  const meadow = [...BUDEN.flatMap((b) => budeArea(b)), ...krippeArea()];

  it(
    'der Christbaum steht an Stelle des Maibaums – der Maibaum ist weg und kommt genau zurück',
    () => {
      const pole = maibaumBlocks();
      expect(pole.length).toBeGreaterThan(40);
      const wrong = pole.filter(([x, y, z, b]) => {
        const now = after(x, y, z);
        // gleicher Block (Kranz = Zweige des Baums) bleibt einfach stehen, sonst kennt der Rückweg den Maibaum-Block
        const back = now === b || plan.restore.get(x, y, z) === b;
        return (
          before(x, y, z) !== b ||
          !back ||
          (!['air', 'light', 'snow'].includes(baseName(now)) && !baseName(now).startsWith('spruce_'))
        );
      });
      expect(wrong.slice(0, 5)).toEqual([]);
      expect(plan.blocks.get(CHRISTBAUM.x, BASE, CHRISTBAUM.z)).toBe('spruce_log');
      expect(baseName(after(CHRISTBAUM.x, BASE + BAUM_SPITZE, CHRISTBAUM.z))).toBe('spruce_leaves');
      expect(after(CHRISTBAUM.x, BASE + BAUM_SPITZE + 1, CHRISTBAUM.z)).toBe('light[level=15]');
      // riesig: über 30 Blöcke hoch, höher als der Maibaum
      expect(BAUM_SPITZE).toBeGreaterThan(30);
      expect(Math.max(...pole.map(([, y]) => y))).toBeLessThan(BASE + BAUM_SPITZE);
    },
    SLOW,
  );

  it(
    'der Baum lässt rund um die Stände Platz zum Gehen und Anklicken der Figuren',
    () => {
      const ring = changed.filter(([x, , z]) => toTree(x, z) < 16);
      const solid = (b: string): boolean =>
        !['air', 'light', 'snow', 'white_candle', 'lantern'].includes(baseName(b)) && kindOf(b) !== 'plant';
      // Feste Winter-Blöcke im Dorfmarkt: nur der Baum selbst (und Laternen auf den Heuballen)
      const outside = ring.filter(([x, , z, b]) => solid(b) && toTree(x, z) > BAUM_RADIUS + 0.75);
      expect(outside.slice(0, 5)).toEqual([]);
      // Weg zwischen Baum und Ständen in Kopfhöhe frei
      const blocked = pairs(range(-12, 12), range(-12, 12))
        .filter(([x, z]) => toTree(x, z) > BAUM_RADIUS + 1.2 && toTree(x, z) < 10)
        .filter(([x, z]) => [BASE + 1, BASE + 2].some((y) => solid(after(x, y, z))));
      expect(blocked.slice(0, 5)).toEqual([]);
      // Wer steht, steht vor den Zweigen; Dorfleute, die um den Maibaum liefen, schickt der Winter nach außen.
      figures
        .filter(([, , walks]) => !walks)
        .forEach(([x, z]) => expect(toTree(x, z), `Figur ${x} ${z}`).toBeGreaterThan(BAUM_RADIUS + 1));
      expect(figures.some(([x, z, walks]) => walks && toTree(x, z) < BAUM_RADIUS + 1)).toBe(true);
      expect(plan.moves).toEqual([
        `execute as @e[type=mannequin,tag=mm_walker,x=0.5,y=${BASE},z=0.5,distance=..${BAUM_RADIUS + 1}] at @s ` +
          `facing 0.5 ${BASE} 0.5 run tp @s ^ ^ ^-4`,
      ]);
    },
    SLOW,
  );

  it(
    'Buden, Krippe, Eisbahn und Schneehaufen stehen auf freier Wiese, weg von Figuren, Rundgang und Launchpads',
    () => {
      const free = (x: number, z: number): boolean =>
        range(BASE, BASE + 10).every((y) => {
          const b = before(x, y, z);
          return b === 'air' || kindOf(b) === 'plant';
        });
      const ground = [
        ...footprint,
        ...pairs(range(EISBAHN.x1 - 1, EISBAHN.x2 + 1), range(EISBAHN.z1 - 1, EISBAHN.z2 + 1)),
      ].filter(([x, z]) => before(x, GROUND, z) !== 'grass_block');
      expect(ground.slice(0, 5)).toEqual([]);
      expect(meadow.filter(([x, z]) => !free(x, z)).slice(0, 5)).toEqual([]);
      const near = (x: number, z: number, d: number): boolean =>
        meadow.some(([mx, mz]) => Math.hypot(mx + 0.5 - x, mz + 0.5 - z) < d) || toRink(x, z) < d;
      figures.forEach(([x, z]) => expect(near(x, z, 3), `Figur ${x} ${z}`).toBe(false));
      TOUR.forEach((s) => expect(near(s.x, s.z, 4), s.title.de).toBe(false));
      [...LAUNCHPADS, ...PARKOUR.blocks].forEach((p) => expect(near(p.x, p.z, 8)).toBe(false));
      const stalls = [
        ...MARKET.map(([x, z]) => [x, z] as const),
        ...SCHLOSSMARKT.map((s) => [s.x, s.z] as const),
      ];
      stalls.forEach(([x, z]) => expect(near(x, z, 6), `Stand ${x} ${z}`).toBe(false));
      SCHNEEHAUFEN.forEach(([x, z]) => expect(before(x, GROUND, z), `Haufen ${x} ${z}`).toBe('grass_block'));
    },
    SLOW,
  );

  it(
    'kein Schnee auf Launchpads und Parkour-Blöcken',
    () => {
      const pads = LAUNCHPADS.flatMap((pad) =>
        pairs([-1, 0, 1], [-1, 0, 1]).flatMap(([dx, dz]) =>
          range(pad.y, pad.y + 2).map((y) => plan.blocks.get(pad.x + dx, y, pad.z + dz)),
        ),
      );
      expect(pads.filter((b) => b !== undefined)).toEqual([]);
      const parkour = PARKOUR.blocks.flatMap((b) => [
        plan.blocks.get(b.x, b.y, b.z),
        plan.blocks.get(b.x, b.y + 1, b.z),
      ]);
      expect(parkour.filter((b) => b !== undefined)).toEqual([]);
    },
    SLOW,
  );

  it(
    'Wege und Plätze: dünne Schicht; dicker Schnee nur auf Wiesen, Kronen, Markisen und in Haufen',
    () => {
      const snow = plan.blocks.find((b) => baseName(b) === 'snow');
      expect(snow.length).toBeGreaterThan(30_000);
      const wrong = snow
        .filter(([, , , b]) => b !== 'snow[layers=1]')
        .filter(([x, y, z]) => {
          const under = after(x, y - 1, z);
          return !(
            ['ground', 'leaves'].includes(kindOf(under)) ||
            under.endsWith('_wool') ||
            under === 'snow_block'
          );
        });
      expect(wrong.slice(0, 5)).toEqual([]);
      // Ankunft: Kies der Gasse mit einer Schicht (ohne Höhe – man läuft wie vorher).
      expect(before(0, GROUND, 27)).toBe('gravel');
      expect(plan.blocks.get(0, BASE, 27)).toBe('snow[layers=1]');
      // Neben den Wegen ein Schneewall (mehr Schichten als auf der Wiese daneben), aber noch ohne Sprung begehbar.
      const banks = snow.filter(([, , , b]) => ['snow[layers=3]', 'snow[layers=4]'].includes(b));
      expect(banks.length).toBeGreaterThan(2000);
      // Markisen der Buden: dicker Schnee
      const [mx, mz] = [MARKET[0]![0], MARKET[0]![1]];
      expect(plan.blocks.get(mx, GROUND + 6, mz - 1)).toBe('snow[layers=3]');
    },
    SLOW,
  );

  it(
    'Rückweg: jede geänderte Stelle kennt ihren alten Block, Würfel räumen nur Winter-Schnee',
    () => {
      expect(changed.length).toBeGreaterThan(50_000);
      const wrong = changed.filter(([x, y, z, b]) => {
        const old = plan.restore.get(x, y, z);
        const inside = x >= INNER.from && x <= INNER.to && z >= INNER.from && z <= INNER.to;
        // Außerhalb des Dorfs nur die hohen Almen: Gras über der Schneegrenze der Berge wird Schneeblock.
        const allowed = inside || (old === 'grass_block' && b === 'snow_block' && y >= GROUND + 80);
        return old !== before(x, y, z) || old === b || !allowed;
      });
      expect(wrong.slice(0, 5)).toEqual([]);
      // „Schnee weg“ als ein Befehl je Würfel: dort darf der Bauplan selbst keinen Schnee haben.
      const plannedSnow = canvas.find((b) => baseName(b) === 'snow');
      plan.snowBoxes.forEach((box) => {
        expect(box.x1 >= INNER.from && box.x2 <= INNER.to && box.z1 >= INNER.from && box.z2 <= INNER.to).toBe(
          true,
        );
        const hit = plannedSnow.find(
          ([x, y, z]) =>
            x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2 && z >= box.z1 && z <= box.z2,
        );
        expect(hit, JSON.stringify(box)).toBeUndefined();
      });
      // Berge: Gras ↔ Schneeblock nur außerhalb des Dorfs und nur, wo der Bauplan keinen Schneeblock hat.
      const plannedSnowBlocks = canvas.find((b) => b === 'snow_block');
      expect(plan.mountains.length).toBeGreaterThan(300);
      plan.mountains.forEach((box) => {
        const inside =
          box.x1 >= INNER.from && box.x2 <= INNER.to && box.z1 >= INNER.from && box.z2 <= INNER.to;
        expect(inside).toBe(false);
        const hit = plannedSnowBlocks.find(
          ([x, y, z]) =>
            x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2 && z >= box.z1 && z <= box.z2,
        );
        expect(hit, JSON.stringify(box)).toBeUndefined();
      });
      expect(plan.off.length).toBeLessThan(plan.on.length);
    },
    SLOW,
  );

  it(
    'nur Blocknamen von 26.x; jedes Deko-Wesen mit Winter-Tag und ohne Hitbox',
    () => {
      const renamed = ['chain', 'grass'];
      expect(changed.filter(([, , , b]) => renamed.includes(baseName(b)))).toEqual([]);
      expect(plan.displays.length).toBeGreaterThan(1500);
      expect(plan.displays.length).toBeLessThan(3000);
      const wrong = plan.displays.filter((d) => {
        const block = DISPLAY_BLOCK.exec(d)?.[1];
        const shown = d.startsWith('summon block_display')
          ? block !== undefined && !renamed.includes(block)
          : true;
        return !d.includes("'mm_season_winter'") || !d.includes(NO_HITBOX) || !shown;
      });
      expect(wrong.slice(0, 3)).toEqual([]);
      // Alles da: Kugeln, Stern, Lichter, Buden, Krippe, Weihnachtsmarkt-Schild
      [
        'kugel',
        'stern',
        'licht',
        'kette',
        'stand',
        'bude',
        'krippe',
        'eingang',
        'schlitten',
        'schneemann',
      ].forEach((kind) =>
        expect(
          plan.displays.some((d) => d.includes(`'mm_winter_${kind}'`)),
          kind,
        ).toBe(true),
      );
    },
    SLOW,
  );

  it(
    'Kugeln: Blöcke, die es in der Lobby sonst nicht gibt – mit Paket runde Modelle',
    () => {
      const blocks = Object.values(KUGELN);
      expect(canvas.find((b) => blocks.includes(baseName(b) as (typeof blocks)[number]))).toEqual([]);
      expect(changed.filter(([, , , b]) => blocks.includes(baseName(b) as (typeof blocks)[number]))).toEqual(
        [],
      );
      const used = plan.displays.filter((d) => d.includes("'mm_winter_kugel'"));
      expect(used.length).toBeGreaterThan(100);
      used.forEach((d) => expect(blocks).toContain(DISPLAY_BLOCK.exec(d)?.[1]));
      const zip = furniturePack().toString('latin1');
      blocks.forEach((b) => expect(zip).toContain(`assets/minecraft/blockstates/${b}.json`));
      expect(zip).toContain('assets/moinmorni/models/block/schmuck/kugel_rot.json');
      // Drehungen nur in 22,5°-Schritten, alles im erlaubten Raum
      const elements = kugelModel('gold')['elements'] as ReadonlyArray<{
        from: number[];
        to: number[];
        rotation?: { angle: number };
      }>;
      elements.forEach((e) => {
        [...e.from, ...e.to].forEach((n) => expect(n >= -16 && n <= 32).toBe(true));
        expect([0, 22.5, 45, -22.5, -45]).toContain(e.rotation?.angle ?? 0);
      });
    },
    SLOW,
  );
});

describe('Saison wechseln', () => {
  const steps = seasonStepsFor(7, 3);

  it('Winter setzt den Merker zuerst, dann die Stücke, dann die Deko', () => {
    expect(steps.winter[0]).toBe(`data modify storage ${SEASON_STORAGE} winter set value 1b`);
    expect(steps.winter.slice(1, 8)).toEqual(
      range(0, 6).map((i) => `function moinmorni_season:winter/on_${String(i).padStart(3, '0')}`),
    );
    expect(steps.winter[steps.winter.length - 1]).toBe('function moinmorni_season:winter');
  });

  it('jede andere Saison räumt Winter-Blöcke weg – nur wenn Winter lag – und nimmt den Merker weg', () => {
    SEASONS.filter((s) => s !== 'winter').forEach((season) => {
      const list = steps[season];
      expect(list[0]).toBe(`function moinmorni_season:${season}`);
      expect(list.slice(1, 4)).toEqual(
        range(0, 2).map(
          (i) =>
            `execute if data storage ${SEASON_STORAGE} {winter:1b} run function moinmorni_season:winter/off_${String(i).padStart(3, '0')}`,
        ),
      );
      expect(list[list.length - 1]).toBe(`data remove storage ${SEASON_STORAGE} winter`);
    });
  });
});
