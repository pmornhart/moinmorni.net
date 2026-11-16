/* eslint-disable ts-patterns/no-magic-numbers -- positions in the lobby as the build has them */
import { describe, expect, it } from 'vitest';
import { GROUND } from '../src/nature.js';
import { range } from '../src/range.js';
import { buildLobby } from '../src/lobby/dorfplatz.js';
import { TOUR } from '../src/lobby/features.js';
import { JUMP_AND_RUN, JUMP_LANE_GAP, type JumpLane } from '../src/lobby/jumpandrun.js';

/** Weltgrenze der Lobby (datapack.ts: 400 um die Mitte). */
const BORDER_HALF = 200;
const empty = (b: string | undefined): boolean => b === undefined || b === 'air';

describe('Jump and Run statt Parkour-Spirale', () => {
  const { canvas } = buildLobby();
  const { start, back, board, lanes } = JUMP_AND_RUN;

  it('Startfeld: Smaragd im Boden, darüber frei; Rückkehr daneben auf festem Boden', () => {
    expect(canvas.get(start.x, start.y, start.z)).toBe('emerald_block');
    [1, 2, 3].forEach((dy) => expect(empty(canvas.get(start.x, start.y + dy, start.z))).toBe(true));
    const bx = Math.floor(back.x);
    const bz = Math.floor(back.z);
    expect(bx === start.x && bz === start.z, 'Rückkehr nicht auf dem Startfeld').toBe(false);
    expect(canvas.isSolidAt(bx, back.y - 1, bz)).toBe(true);
    expect(empty(canvas.get(bx, back.y, bz)) && empty(canvas.get(bx, back.y + 1, bz))).toBe(true);
  });

  it('Tafel mit Schrift, Fahnen und Laternen am Start; die Spirale ist weg', () => {
    expect(canvas.get(Math.floor(board.x), GROUND + 2, Math.floor(board.z))).toBe('spruce_planks');
    expect(canvas.extra.some((c) => c.startsWith('summon text_display') && c.includes('Jump and Run'))).toBe(
      true,
    );
    expect(canvas.extra.some((c) => c.includes("text:'Parkour'") || c.includes('"Parkour"'))).toBe(false);
    const near = canvas.find((b) => b.includes('banner') || b === 'lantern');
    expect(near.filter(([x, , z]) => Math.hypot(x - start.x, z - start.z) < 8).length).toBeGreaterThanOrEqual(
      4,
    );
    // Die alte Spirale (x −66 … −56, z −46 … −36, bis 12 Blöcke hoch) steht nicht mehr.
    const spiral = canvas
      .find((b) => b.endsWith('_concrete') || b === 'diamond_block' || b === 'gold_block')
      .filter(([x, y, z]) => x >= -67 && x <= -55 && z >= -47 && z <= -35 && y > GROUND && y < GROUND + 10);
    expect(spiral).toEqual([]);
  });

  it('schwebende Wegweiser-Blöcke sind nicht erreichbar (auch nicht mit Doppelsprung)', () => {
    const hints = canvas
      .find((b) => b.endsWith('_concrete'))
      .filter(([x, y, z]) => y > GROUND && Math.hypot(x - start.x, z - start.z) < 5);
    expect(hints.length).toBeGreaterThanOrEqual(5);
    hints.forEach(([, y]) => expect(y).toBeGreaterThanOrEqual(GROUND + 10));
  });

  it(
    'Bahnen: eigene Würfel hoch über dem Dorf, ohne Überschneidung, leer, in der Weltgrenze',
    { timeout: 30_000 },
    () => {
      expect(lanes.length).toBe(9);
      const apart = (a: JumpLane, b: JumpLane): boolean =>
        a.x2 + JUMP_LANE_GAP < b.x1 ||
        b.x2 + JUMP_LANE_GAP < a.x1 ||
        a.z2 + JUMP_LANE_GAP < b.z1 ||
        b.z2 + JUMP_LANE_GAP < a.z1;
      lanes.forEach((a, i) =>
        lanes
          .slice(i + 1)
          .forEach((b) => expect(apart(a, b), `${JSON.stringify(a)} ${JSON.stringify(b)}`).toBe(true)),
      );
      lanes.forEach((l) => {
        expect(l.y1).toBeGreaterThanOrEqual(GROUND + 80);
        expect(Math.max(Math.abs(l.x1), Math.abs(l.x2), Math.abs(l.z1), Math.abs(l.z2))).toBeLessThan(
          BORDER_HALF - 8,
        );
        const taken = range(l.x1, l.x2).flatMap((x) =>
          range(l.z1, l.z2).flatMap((z) =>
            range(l.y1 - 2, l.y2 + 1)
              .filter((y) => !empty(canvas.get(x, y, z)))
              .map((y) => `${x} ${y} ${z}`),
          ),
        );
        expect(taken).toEqual([]);
      });
      // Die nächste Bahn zum Startplatz zuerst.
      const dist = (l: JumpLane): number =>
        Math.hypot((l.x1 + l.x2) / 2 - start.x, (l.z1 + l.z2) / 2 - start.z);
      lanes.slice(1).forEach((l, i) => expect(dist(l)).toBeGreaterThanOrEqual(dist(lanes[i]!)));
    },
  );

  it('der Rundgang zeigt das Jump and Run statt der Spirale', () => {
    expect(TOUR.some((s) => s.title.de === 'Jump and Run')).toBe(true);
    expect(TOUR.some((s) => s.title.de === 'Parkour')).toBe(false);
  });
});
