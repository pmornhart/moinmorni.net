/* eslint-disable ts-patterns/no-magic-numbers -- positions and distances in the lobby as the build has them */
/**
 * Saisons mit Bauten außer dem Winter (der hat `winter.test.ts`): Wiesn, Ostern, Halloween. Gemeinsame Regeln für
 * jede Saison (Rückweg, Platz für Figuren, Rundgang, Launchpads, Jump and Run, Eingang), dazu das Herzstück je Saison.
 */
import { describe, expect, it } from 'vitest';
import { baseName } from '../src/canvas.js';
import { GROUND } from '../src/nature.js';
import { disc, pairs, range } from '../src/range.js';
import { MARKET, buildLobby } from '../src/lobby/dorfplatz.js';
import { NO_HITBOX } from '../src/lobby/deko.js';
import { CHRISTBAUM, maibaumBlocks } from '../src/lobby/christbaum.js';
import { LAUNCHPADS, TOUR } from '../src/lobby/features.js';
import { JUMP_AND_RUN } from '../src/lobby/jumpandrun.js';
import { SCHLOSSMARKT } from '../src/lobby/schlossmarkt.js';
import { seasonPlan, type Season } from '../src/lobby/season.js';
import { EINGANG } from '../src/lobby/weihnachtsmarkt.js';
import { INNER, kindOf } from '../src/lobby/winter-base.js';
import { KARUSSELL, RIESENRAD, riesenradArea } from '../src/lobby/wiesn.js';

const BASE = GROUND + 1;
/** Rechnen dauert (Bauplan + Saison) – die einzelnen Prüfungen sammeln Fehler und vergleichen einmal. */
const SLOW = 60_000;

const groundOf = (y: number): string => {
  if (y > GROUND) return 'air';
  return y === GROUND ? 'grass_block' : 'dirt';
};

// Figur im Bau: "summon mannequin -7.5 65 14.5 {Tags:[…]}" → -7.5 und 14.5; passt nicht: "summon text_display …".
// https://regex101.com/?flavor=javascript&regex=%5Esummon%20mannequin%20(%5B-%5Cd.%5D%2B)%20%5B-%5Cd.%5D%2B%20(%5B-%5Cd.%5D%2B)%20&testString=summon%20mannequin%20-7.5%2065%2014.5%20%7BTags%3A%5B%5D%7D
const MANNEQUIN = /^summon mannequin ([-\d.]+) [-\d.]+ ([-\d.]+) /;
// Block einer Anzeige: "block_state:{Name:'minecraft:snow_block',id:…" → snow_block; passt nicht: "id:'minecraft:x'".
// https://regex101.com/?flavor=javascript&regex=Name%3A'minecraft%3A(%5Ba-z_%5D%2B)'&testString=block_state%3A%7BName%3A'minecraft%3Asnow_block'%2Cid%3A'minecraft%3Asnow_block'%7D
const DISPLAY_BLOCK = /Name:'minecraft:([a-z_]+)'/;
/**
 * Ein Wesen an festen, lesbaren Koordinaten: "summon block_display 0.5 66.2 -3.75 {" – kein NaN, keine e-Schreibweise.
 * https://regex101.com/?flavor=javascript&regex=%5Esummon%20%5Cw%2B(%20-%3F%5Cd%2B(%5C.%5Cd%2B)%3F)%7B3%7D%20%5C%7B&testString=summon%20block_display%200.5%2066.2%20-3.75%20%7B
 */
const SUMMON_AT = /^summon \w+( -?\d+(\.\d+)?){3} \{/;
/**
 * Unlesbare Zahl in einem Befehl: "tp 1 NaN 2" oder "… Infinity …"; passt nicht: "tp 1 64 2".
 * https://regex101.com/?flavor=javascript&regex=NaN%7CInfinity&testString=tp%201%20NaN%202
 */
const BROKEN = /NaN|Infinity/;
/**
 * Kabine einer Gondel (Größe 0,9 × 0,7): "scale:[0.9f,0.7f,0.8f]"; passt nicht: "scale:[0.9f,0.12f,0.9f]".
 * https://regex101.com/?flavor=javascript&regex=scale%3A%5C%5B0%5C.9f%3F%2C0%5C.7f%3F&testString=scale%3A%5B0.9f%2C0.7f%2C0.8f%5D
 */
const CABIN = /scale:\[0\.9f?,0\.7f?/;
/**
 * Ende eines Kettenblocks: "iron_chain[axis=y]"; passt nicht: "chain" (alter Name), "iron_block".
 * https://regex101.com/?flavor=javascript&regex=%5Eiron_chain&testString=iron_chain%5Baxis%3Dy%5D
 */
const CHAIN_BLOCK = /^iron_chain/;
/**
 * Fester Beton des Rings: "white_concrete", "light_blue_concrete"; passt nicht: "white_concrete_powder".
 * https://regex101.com/?flavor=javascript&regex=_concrete%24&testString=light_blue_concrete
 */
const CONCRETE = /_concrete$/;
/**
 * Sitzfläche eines Karussell-Sitzes (0,6 × 0,1): "scale:[0.6f,0.1f,0.55f]"; passt nicht: "scale:[0.6f,0.4f,0.08f]".
 * https://regex101.com/?flavor=javascript&regex=scale%3A%5C%5B0%5C.6f%3F%2C0%5C.1f%3F%2C&testString=scale%3A%5B0.6f%2C0.1f%2C0.55f%5D
 */
const SEAT = /scale:\[0\.6f?,0\.1f?,/;
/** Blöcke, durch die man gehen kann (oder die man nicht als Hindernis sieht). */
const PASSABLE_BLOCKS: ReadonlySet<string> = new Set(['air', 'light', 'snow']);
const passable = (block: string): boolean =>
  PASSABLE_BLOCKS.has(baseName(block)) || kindOf(block) === 'plant';

const { canvas } = buildLobby();
const figures = canvas.extra
  .map((cmd) => MANNEQUIN.exec(cmd))
  .filter((m): m is RegExpExecArray => m !== null)
  .map((m) => [Number(m[1]), Number(m[2]), m.input.includes("'mm_walker'")] as const);

/** Regeln, die für jede Saison mit Bauten gelten; `kinds` = Arten der Deko, die da sein müssen. */
function sharedRules(season: Season, kinds: readonly string[]): void {
  const plan = seasonPlan(season, canvas);
  if (!plan) throw new Error(`keine Bauten: ${season}`);
  const before = (x: number, y: number, z: number): string => canvas.get(x, y, z) ?? groundOf(y);
  const changed = plan.blocks.find(() => true);
  /** Feste Saison-Blöcke in Kopfhöhe (Boden + 1 bis + 2). */
  const solidAt = (x: number, z: number): boolean =>
    [BASE, BASE + 1].some((y) => {
      const b = plan.blocks.get(x, y, z);
      return b !== undefined && !passable(b);
    });
  const nearSolid = (x: number, z: number, d: number): boolean =>
    changed.some(
      ([cx, cy, cz, b]) =>
        (cy === BASE || cy === BASE + 1) && !passable(b) && Math.hypot(cx + 0.5 - x, cz + 0.5 - z) < d,
    );

  it(
    `${season}: Rückweg – jede geänderte Stelle kennt ihren alten Block, nur im Dorf`,
    () => {
      expect(changed.length).toBeGreaterThan(100);
      const wrong = changed.filter(([x, y, z, b]) => {
        const old = plan.restore.get(x, y, z);
        const inside = x >= INNER.from && x <= INNER.to && z >= INNER.from && z <= INNER.to;
        return old !== before(x, y, z) || old === b || !inside;
      });
      expect(wrong.slice(0, 5)).toEqual([]);
      expect(plan.off.length).toBeGreaterThan(0);
    },
    SLOW,
  );

  it(
    `${season}: Figuren, Rundgang, Launchpads, Jump and Run und Stände bleiben frei`,
    () => {
      // Wer steht, hat Platz ringsum; Dorfleute, die herumlaufen, stehen nicht in einem Saison-Block
      figures
        .filter(([, , walks]) => !walks)
        .forEach(([x, z]) => expect(nearSolid(x, z, 1.5), `Figur ${x} ${z}`).toBe(false));
      figures
        .filter(([, , walks]) => walks)
        .forEach(([x, z]) =>
          expect(solidAt(Math.floor(x), Math.floor(z)), `Dorfbewohner ${x} ${z}`).toBe(false),
        );
      TOUR.forEach((s) => expect(nearSolid(s.x + 0.5, s.z + 0.5, 2), s.title.de).toBe(false));
      LAUNCHPADS.forEach((p) =>
        pairs([-1, 0, 1], [-1, 0, 1]).forEach(([dx, dz]) =>
          range(p.y, p.y + 3).forEach((y) =>
            expect(plan.blocks.get(p.x + dx, y, p.z + dz), `Launchpad ${p.x} ${p.z}`).toBeUndefined(),
          ),
        ),
      );
      const { x: jx, y: jy, z: jz } = JUMP_AND_RUN.start;
      const jump = disc(jx, jz, 5).flatMap(([x, z]) =>
        [jy, jy + 1, jy + 2].map((y) => plan.blocks.get(x, y, z)),
      );
      expect(jump.filter((b) => b !== undefined)).toEqual([]);
      // vor den Ständen (Figuren dahinter) in Kopfhöhe frei
      [...MARKET.map(([x, z]) => [x, z] as const), ...SCHLOSSMARKT.map((s) => [s.x, s.z] as const)].forEach(
        ([x, z]) => expect(solidAt(x, z), `Stand ${x} ${z}`).toBe(false),
      );
    },
    SLOW,
  );

  it(
    `${season}: der Eingang von der Ankunft her bleibt offen, der Maibaum bleibt`,
    () => {
      const { x1, x2, z } = EINGANG;
      const blocked = range(x1 + 1, x2 - 1).filter((x) =>
        range(BASE, BASE + 3).some((y) => {
          const b = plan.blocks.get(x, y, z);
          return b !== undefined && !passable(b);
        }),
      );
      expect(blocked).toEqual([]);
      // Der Maibaum steht weiter (die Saison baut um ihn herum)
      const pole = maibaumBlocks().filter(([x, y, z]) => plan.blocks.get(x, y, z) !== undefined);
      expect(pole.slice(0, 5)).toEqual([]);
    },
    SLOW,
  );

  it(
    `${season}: nur Blocknamen von 26.x; jedes Deko-Wesen mit Saison-Tag, ohne Hitbox, lesbar`,
    () => {
      const renamed = ['chain', 'grass'];
      expect(changed.filter(([, , , b]) => renamed.includes(baseName(b)))).toEqual([]);
      // Anzeigen ohne Hitbox (Tiere wie die Osterhasen sind echte Tiere)
      const wrong = plan.displays
        .filter((d) => !d.startsWith('summon rabbit'))
        .filter((d) => {
          const block = DISPLAY_BLOCK.exec(d)?.[1];
          const shown = d.startsWith('summon block_display')
            ? block !== undefined && !renamed.includes(block)
            : true;
          return (
            !d.includes(`'mm_season_${season}'`) || !d.includes(NO_HITBOX) || !shown || !SUMMON_AT.test(d)
          );
        });
      expect(wrong.slice(0, 3)).toEqual([]);
      expect([...plan.on, ...plan.off, ...plan.moves].filter((c) => BROKEN.test(c))).toEqual([]);
      kinds.forEach((kind) =>
        expect(
          plan.displays.some((d) => d.includes(`'mm_${season}_${kind}'`)),
          kind,
        ).toBe(true),
      );
    },
    SLOW,
  );
}

describe('Wiesn', () => {
  sharedRules('wiesn', ['karussell', 'eingang', 'bude', 'riesenrad', 'kette', 'herz']);
  const plan = seasonPlan('wiesn', canvas);
  const at = (x: number, y: number, z: number): string | undefined => plan?.blocks.get(x, y, z);
  const pole = { x: CHRISTBAUM.x, z: CHRISTBAUM.z };

  it(
    'Kettenkarussell um den Maibaum: Dach in Weiß-Blau, 16 Sitze an Ketten, darunter läuft man frei',
    () => {
      const roof = disc(pole.x, pole.z, KARUSSELL.r)
        .map(([x, z]) => at(x, GROUND + KARUSSELL.height, z))
        .filter((b): b is string => b !== undefined);
      expect(roof.length).toBeGreaterThan(100);
      expect(new Set(roof)).toEqual(new Set(['white_wool', 'light_blue_wool']));
      const chains = plan?.blocks.find((b) => CHAIN_BLOCK.test(b)) ?? [];
      expect(chains.length).toBe(KARUSSELL.seats * 2);
      // Ketten enden zwei Blöcke unter dem Dach – darunter ist Kopfhöhe frei
      expect(Math.min(...chains.map(([, y]) => y))).toBe(GROUND + KARUSSELL.height - 2);
      const seats = plan?.displays.filter((d) => d.includes("'mm_wiesn_karussell'") && SEAT.test(d)) ?? [];
      expect(seats.length).toBe(KARUSSELL.seats);
      const under = disc(pole.x, pole.z, KARUSSELL.r).filter(([x, z]) =>
        [BASE, BASE + 1, BASE + 2].some((y) => {
          const b = at(x, y, z);
          return b !== undefined && !passable(b);
        }),
      );
      expect(under).toEqual([]);
    },
    SLOW,
  );

  it(
    'Riesenrad: auf freier Wiese, Ring an einem Stück auf seiner Stütze, acht Gondeln',
    () => {
      const free = riesenradArea().filter(([x, z]) =>
        range(BASE + 1, BASE + 20).some((y) => {
          const b = canvas.get(x, y, z) ?? 'air';
          return b !== 'air' && !passable(b);
        }),
      );
      expect(free).toEqual([]);
      const { x, y, z, r } = RIESENRAD;
      expect(at(x, y - r, z), 'tiefster Punkt des Rings').toMatch(CONCRETE);
      expect(at(x, y + r, z), 'höchster Punkt des Rings').toMatch(CONCRETE);
      expect(at(x, y - r - 1, z), 'Stütze').toBe('stripped_spruce_log');
      const cabins = plan?.displays.filter((d) => d.includes("'mm_wiesn_riesenrad'") && CABIN.test(d));
      expect(cabins?.length).toBe(8);
      [...LAUNCHPADS, JUMP_AND_RUN.start].forEach((p) =>
        expect(Math.hypot(p.x - x, p.z - z), `${p.x} ${p.z}`).toBeGreaterThan(12),
      );
    },
    SLOW,
  );
});
