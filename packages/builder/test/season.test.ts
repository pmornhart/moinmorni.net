import { describe, expect, it } from 'vitest';
import { SEASONS, seasonCommands } from '../src/lobby/season.js';

describe('Saison-Deko', () => {
  it('räumt zuerst die alte Deko weg', () => {
    SEASONS.forEach((season) => expect(seasonCommands(season)[0]).toBe('kill @e[tag=mm_season]'));
  });

  it('nennt den Block für alte (Name) und neue Versionen (id, ab 26.3)', () => {
    const blocks = SEASONS.flatMap((season) => seasonCommands(season)).filter((c) =>
      c.includes('block_display'),
    );
    expect(blocks.length).toBeGreaterThan(0);
    blocks.forEach((c) => {
      expect(c).toMatch(/block_state:\{Name:'minecraft:[a-z_]+',id:'minecraft:[a-z_]+'/); // e.g. {Name:'minecraft:barrel',id:'minecraft:barrel'
      expect(c.includes('Properties:')).toBe(c.includes('properties:'));
    });
  });
});
