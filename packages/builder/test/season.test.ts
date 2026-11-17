import { describe, expect, it } from 'vitest';
import { buildLobby } from '../src/lobby/dorfplatz.js';
import { SEASONS, seasonCommands } from '../src/lobby/season.js';

describe('Saison-Deko', () => {
  const { canvas } = buildLobby();

  it('räumt zuerst die alte Deko weg', () => {
    SEASONS.forEach((season) => expect(seasonCommands(season, canvas)[0]).toBe('kill @e[tag=mm_season]'));
  }, 60_000);

  it('nennt den Block für alte (Name) und neue Versionen (id, ab 26.3)', () => {
    const blocks = SEASONS.flatMap((season) => seasonCommands(season, canvas)).filter((c) =>
      c.includes('block_display'),
    );
    expect(blocks.length).toBeGreaterThan(0);
    blocks.forEach((c) => {
      expect(c).toMatch(/block_state:\{Name:'minecraft:[a-z_]+',id:'minecraft:[a-z_]+'/); // e.g. {Name:'minecraft:barrel',id:'minecraft:barrel'
      expect(c.includes('Properties:')).toBe(c.includes('properties:'));
    });
  });
});
