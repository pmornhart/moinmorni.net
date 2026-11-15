import { describe, expect, it } from 'vitest';
import { buildLobby } from '../src/lobby/dorfplatz.js';
import { isPartialBlock, MOEBEL_BODEN } from '../src/furniture.js';
import { STEP, type Facing } from '../src/shapes.js';

// Richtung der Lehne aus dem Blockzustand: "mangrove_stairs[facing=north,…]" → "north".
// https://regex101.com/?flavor=javascript&regex=facing%3D(%5Ba-z%5D%2B)&testString=mangrove_stairs%5Bfacing%3Dnorth%2Chalf%3Dbottom%5D
const FACING = /facing=([a-z]+)/;

describe('Möbel in der fertigen Lobby', () => {
  const { canvas } = buildLobby();

  it('unter Stühlen und Hockern liegen Fichtendielen, unter Bierbänken Kies (die Modelle zeichnen den Boden mit)', () => {
    const house = canvas.find((b) => b.startsWith('mangrove_stairs') || b === 'mangrove_slab[type=bottom]');
    const garden = canvas.find((b) => b === 'birch_slab[type=bottom]');
    expect(house.length).toBeGreaterThan(10);
    expect(garden.length).toBeGreaterThan(10);
    house.forEach(([x, y, z, b]) =>
      expect(canvas.get(x, y - 1, z), `${b} bei ${x} ${y} ${z}`).toBe(MOEBEL_BODEN.haus),
    );
    garden.forEach(([x, y, z]) =>
      expect(canvas.get(x, y - 1, z), `Bierbank bei ${x} ${y} ${z}`).toBe(MOEBEL_BODEN.biergarten),
    );
  });

  it('Stühle an der Wand sind Eckbank-Stücke (Vertäfelung deckt die Wand), freie Stühle haben keine volle Seite', () => {
    const seats = canvas.find((b) => b.startsWith('mangrove_stairs'));
    const benches = seats.filter(([, , , b]) => b.includes('shape=straight'));
    expect(benches.length).toBeGreaterThan(5);
    expect(seats.length - benches.length).toBeGreaterThan(5);
    seats.forEach(([x, y, z, b]) => {
      const facing = (FACING.exec(b)?.[1] ?? 'north') as Facing;
      const [dx, dz] = STEP[facing];
      const wall = !isPartialBlock(canvas.get(x + dx, y, z + dz));
      expect(b.includes('shape=straight'), `Sitz bei ${x} ${y} ${z}: ${b}`).toBe(wall);
      expect(b.includes('shape=outer_right'), `Sitz bei ${x} ${y} ${z}: ${b}`).toBe(!wall);
    });
  });
});
