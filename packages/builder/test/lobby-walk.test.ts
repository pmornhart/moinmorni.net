/* eslint-disable ts-patterns/no-magic-numbers -- positions in the lobby and in small test worlds */
import { describe, expect, it } from 'vitest';
import { Canvas } from '../src/canvas.js';
import { GROUND } from '../src/nature.js';
import { range } from '../src/range.js';
import { LOBBY_SPAWN_VIEW } from '../src/lobby/features.js';
import { buildLobby } from '../src/lobby/dorfplatz.js';
import { SCHLOSSTREPPE, VORPLATZ } from '../src/lobby/schlosstreppe.js';
import { ON_PURPOSE, reachFrom, spotKey, walkReport, WalkMap } from '../src/lobby/walk.js';

const PX = 16;
const START = { x: 0, y: GROUND + 1, z: 0 };
const SMALL_WORLD = 12;

/** Kleine Welt aus Grundwelt plus den Blöcken des Tests: wie oft muss man springen, um auf (x, y, z) zu stehen? */
function jumpsTo(c: Canvas, x: number, y: number, z: number): number | undefined {
  const reach = reachFrom(new WalkMap(c, SMALL_WORLD), START);
  return reach.jumps.get(spotKey(x, z, y * PX));
}

describe('Regeln „zu Fuß“ (kleine Welt)', () => {
  it('einen Block hinauf geht mit Sprung, zwei nicht, Zäune (1½) auch nicht', () => {
    const c = new Canvas();
    c.set(3, GROUND + 1, 0, 'stone');
    range(GROUND + 1, GROUND + 2).forEach((y) => c.set(5, y, 0, 'stone'));
    c.set(0, GROUND + 1, 4, 'oak_fence');
    expect(jumpsTo(c, 3, GROUND + 2, 0)).toBe(1);
    expect(jumpsTo(c, 5, GROUND + 3, 0)).toBeUndefined();
    expect(jumpsTo(c, 0, GROUND + 2.5, 4)).toBeUndefined();
  });

  it('Treppen und Stufen nimmt man ohne Sprung – nur von hinten (an der hohen Seite) muss man springen', () => {
    const c = new Canvas();
    c.set(-3, GROUND + 1, 0, 'stone_stairs[facing=west,half=bottom]');
    c.set(0, GROUND + 1, -3, 'stone_slab[type=bottom]');
    // Treppe nach Süden, vorne (Norden) und seitlich zugemauert: nur von hinten erreichbar
    c.set(0, GROUND + 1, 5, 'stone_stairs[facing=south,half=bottom]');
    [
      [0, 4],
      [-1, 5],
      [1, 5],
    ].forEach(([x = 0, z = 0]) => range(GROUND + 1, GROUND + 3).forEach((y) => c.set(x, y, z, 'stone')));
    expect(jumpsTo(c, -3, GROUND + 2, 0)).toBe(0);
    expect(jumpsTo(c, 0, GROUND + 1.5, -3)).toBe(0);
    expect(jumpsTo(c, 0, GROUND + 2, 5)).toBe(1);
  });

  it('Türen gehen auf, Leitern führen hinauf; ohne Tür bleibt ein Raum zu', () => {
    const room = (door: boolean): Canvas => {
      const c = new Canvas();
      range(2, 6).forEach((x) =>
        range(2, 6).forEach((z) => {
          const wall = x === 2 || x === 6 || z === 2 || z === 6;
          range(GROUND + 1, GROUND + 3).forEach((y) => c.set(x, y, z, wall ? 'stone_bricks' : 'air'));
        }),
      );
      if (door) {
        c.set(4, GROUND + 1, 2, 'oak_door[facing=north,half=lower]');
        c.set(4, GROUND + 2, 2, 'oak_door[facing=north,half=upper]');
      }
      // Dachboden über eine Leiter
      range(2, 6).forEach((x) => range(2, 6).forEach((z) => c.set(x, GROUND + 4, z, 'oak_planks')));
      range(GROUND + 1, GROUND + 5).forEach((y) => c.set(5, y, 5, 'ladder[facing=north]'));
      range(GROUND + 5, GROUND + 7).forEach((y) => c.set(3, y, 3, 'air'));
      return c;
    };
    expect(jumpsTo(room(true), 4, GROUND + 1, 4)).toBe(0);
    expect(jumpsTo(room(true), 3, GROUND + 5, 3)).toBe(0);
    expect(jumpsTo(room(false), 4, GROUND + 1, 4)).toBeUndefined();
  });

  it('springen braucht Platz über dem Kopf', () => {
    const c = new Canvas();
    c.set(0, GROUND + 1, -5, 'stone');
    // Decke über allen Wegen zur Stufe (zwei Blöcke Luft reichen nicht zum Hochspringen), über der Stufe offen
    range(-2, 2).forEach((x) =>
      range(-7, -3)
        .filter((z) => x !== 0 || z !== -5)
        .forEach((z) => c.set(x, GROUND + 3, z, 'stone')),
    );
    range(-3, 3).forEach((x) =>
      range(-8, -2)
        .filter((z) => Math.abs(x) === 3 || z === -8 || z === -2)
        .forEach((z) => range(GROUND + 1, GROUND + 3).forEach((y) => c.set(x, y, z, 'stone'))),
    );
    c.set(0, GROUND + 1, -2, 'oak_door[facing=south,half=lower]');
    c.set(0, GROUND + 2, -2, 'oak_door[facing=south,half=upper]');
    expect(jumpsTo(c, 0, GROUND + 1, -4)).toBe(0);
    expect(jumpsTo(c, 0, GROUND + 2, -5)).toBeUndefined();
  });
});

describe('Lobby: alles zu Fuß erreichbar', () => {
  const { canvas } = buildLobby();
  const report = walkReport(canvas, LOBBY_SPAWN_VIEW);

  it('jeder Raum und Platz ist zu Fuß erreichbar – ohne einen einzigen Sprung', () => {
    const missing = report.places.filter((p) => !p.reached && !ON_PURPOSE[p.name]).map((p) => p.name);
    const jumping = report.places
      .filter((p) => p.reached && p.jumps > 0)
      .map((p) => `${p.name} (${p.jumps}×)`);
    expect(missing).toEqual([]);
    expect(jumping).toEqual([]);
    expect(report.places.length).toBeGreaterThan(80);
  });

  it('kein anderer Boden bleibt unerreichbar (Dächer, Bäume, Markisen und Möbel sind Deko)', () => {
    const lost = report.lost
      .filter((l) => l.kind === 'boden' && !ON_PURPOSE[l.name])
      .map((l) => `${l.name}: ${l.size} Spalten auf ${l.y}`);
    expect(lost).toEqual([]);
  });

  it('gewollt unerreichbar bleibt es: Gefängnis, Brunnenbecken', () => {
    Object.keys(ON_PURPOSE).forEach((name) => {
      const place = report.places.find((p) => p.name === name);
      expect(place, name).toBeDefined();
      expect(place?.reached, name).toBe(false);
    });
  });

  it('Philips Stellen: Bibliothek von der Bastei aus, Schloss vom Schlossmarkt aus – alles über Treppen', () => {
    const { map, reach } = report;
    /** Sprünge bis zu einer Stelle der Spalte (x, z) mit den Füßen auf Höhe y … y+1 (Teppich zählt mit). */
    const at = (x: number, y: number, z: number): number | undefined =>
      map
        .column(x, z)
        .filter((s) => s.h >= y * PX && s.h < (y + 1) * PX)
        .map((s) => reach.jumps.get(spotKey(x, z, s.h)))
        .find((j) => j !== undefined);
    // Vor der Tür der Bibliothek (Bastei-Boden) und drinnen
    expect(at(-19, 91, -111)).toBe(0);
    expect(at(-31, 93, -112)).toBe(0);
    // Am Schlossberg über dem Markt (Schlosstreppe) und oben im Hof
    expect(at(-5, 83, -57)).toBe(0);
    expect(at(0, 91, -110)).toBe(0);
    ['Schloss: Festsaal', 'Schloss: Galerie', 'Schloss: Bibliothek', 'Schloss: Rittersaal'].forEach((name) =>
      expect(report.places.find((p) => p.name === name)?.jumps, name).toBe(0),
    );
  });

  it('Schlosstreppe: 26 Stufen in vier Läufen mit drei Podesten, oben bündig mit dem Vorplatz', () => {
    const steps = SCHLOSSTREPPE.filter((row) => row.landing === undefined);
    expect(steps.length).toBe(26);
    expect(new Set(SCHLOSSTREPPE.map((row) => row.landing).filter((l) => l !== undefined)).size).toBe(3);
    SCHLOSSTREPPE.slice(1).forEach((row, i) => {
      const prev = SCHLOSSTREPPE[i]!;
      expect(prev.z - row.z).toBe(1);
      expect(row.y - prev.y).toBe(row.landing === undefined ? 1 : 0);
    });
    expect(SCHLOSSTREPPE[0]?.y).toBe(GROUND + 2);
    expect(SCHLOSSTREPPE[SCHLOSSTREPPE.length - 1]?.y).toBe(VORPLATZ.y + 1);
    expect(SCHLOSSTREPPE[SCHLOSSTREPPE.length - 1]?.z).toBe(VORPLATZ.z2 + 1);
  });
});
