import { describe, expect, it } from 'vitest';
import {
  buildWartung,
  WARTUNG_BORDER,
  WARTUNG_PARKOUR_STEPS,
  WARTUNG_PARKOUR_TOP,
  WARTUNG_POINTS,
  wartungHeight,
  wartungPack,
} from '../src/index.js';
import { GROUND } from '../src/nature.js';

/** Bauplan der Wartungs-Lobby (ohne Server prüfbar). */
describe('Wartungs-Lobby', () => {
  const { canvas } = buildWartung();
  const free = (x: number, y: number, z: number): boolean => {
    const b = canvas.get(x, y, z);
    return b === undefined || b === 'air';
  };

  it('Sprung-Parcours: nur einfache Sprünge (1 hoch: 2 vor, gleich hoch: höchstens 3 vor), Platz für den Kopf', () => {
    const start = { ...WARTUNG_POINTS.parkourStart, y: GROUND };
    const top = WARTUNG_PARKOUR_TOP;
    const last = WARTUNG_PARKOUR_STEPS[WARTUNG_PARKOUR_STEPS.length - 1];
    const path = [start, ...WARTUNG_PARKOUR_STEPS, { ...top, z: top.z + 1 }];
    path.slice(1).forEach((b, i) => {
      const a = path[i]!;
      const dy = b.y - a.y;
      const reach = Math.abs(b.x - a.x) + Math.abs(b.z - a.z);
      expect(Math.min(Math.abs(b.x - a.x), Math.abs(b.z - a.z)), `gerade: ${i}`).toBe(0);
      expect([0, 1], `Höhe: ${i}`).toContain(dy);
      expect(reach, `Weite: ${i}`).toBeLessThanOrEqual(dy === 1 ? 2 : 3);
    });
    expect(last).toBeDefined();
    WARTUNG_PARKOUR_STEPS.forEach((s) => {
      expect(free(s.x, s.y + 1, s.z) && free(s.x, s.y + 2, s.z), `frei über ${s.x} ${s.z}`).toBe(true);
    });
    expect(canvas.get(top.x, top.y + 1, top.z)).toBe('heavy_weighted_pressure_plate');
    const s = WARTUNG_POINTS.parkourStart;
    expect(canvas.get(s.x, s.y, s.z)).toBe('light_weighted_pressure_plate');
  });

  it('Ankunft: frei zum Stehen, flacher Kessel, Weltgrenze hinter den Bergen', () => {
    const { x, y, z } = WARTUNG_POINTS.spawn;
    expect(free(Math.floor(x), y, Math.floor(z)) && free(Math.floor(x), y + 1, Math.floor(z))).toBe(true);
    const height = wartungHeight();
    [0, 10, 20, 30].forEach((r) => expect(height(r, 0)).toBe(GROUND));
    expect(height(60, 0)).toBeGreaterThan(GROUND + 10);
    expect(WARTUNG_BORDER / 2).toBeGreaterThan(60);
  });

  it('Datenpaket: Aushang de/en, gleiche Version bei gleichem Plan, nur Blocknamen von 26.x', () => {
    const pack = wartungPack();
    const text = Object.values(pack.files).join('\n');
    expect(text).toContain('Wartungsarbeiten');
    expect(text).toContain('Maintenance – back in a moment!');
    expect(text).not.toMatch(/[ :]chain[ [\]]/);
    expect(text).not.toMatch(/ grass[ [\]]/);
    expect(wartungPack().version).toBe(pack.version);
    expect(pack.namespace).toBe('moinmorni_wartung');
  });
});
