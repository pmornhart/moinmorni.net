/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/require-regex-example -- sizes and view ranges as the rule computes them; patterns check whole summon lines, e.g. "…,view_range:0.4f}" matches, "…}" not */
import { describe, expect, it } from 'vitest';
import { blockDisplay, viewRangeFor, withViewRange } from '../src/lobby/deko.js';
import { lobbyPack } from '../src/lobby/datapack.js';

/** Sichtweite kleiner Anzeige-Teile (Leistung): nur so weit zeichnen, wie man sie noch sieht. */
describe('Sichtweite nach Größe', () => {
  it('kleine Teile enden, wo sie unter etwa drei Bildpunkte schrumpfen, größere bleiben', () => {
    expect(viewRangeFor(0.08, false)).toBe(0.3);
    expect(viewRangeFor(0.12, false)).toBe(0.5);
    expect(viewRangeFor(0.3, false)).toBeNull();
    // Leuchtendes doppelt so weit (ein heller Punkt fällt nachts noch auf)
    expect(viewRangeFor(0.08, true)).toBe(0.65);
    expect(viewRangeFor(0.17, true)).toBeNull();
    expect(viewRangeFor(0.01, false)).toBe(0.25);
  });

  it('setzt view_range nur bei Block-/Item-Anzeigen ohne eigene Sichtweite', () => {
    const tiny = blockDisplay("Tags:['t']", [0, 0, 0], 'red_concrete', { scale: [0.1, 0.1, 0.1] });
    expect(withViewRange(tiny)).toMatch(/,view_range:0\.4f\}$/);
    const glow = blockDisplay("Tags:['t']", [0, 0, 0], 'glowstone', { scale: [0.1, 0.1, 0.1], glow: true });
    expect(withViewRange(glow)).toMatch(/,view_range:0\.8f\}$/);
    const big = blockDisplay("Tags:['t']", [0, 0, 0], 'red_concrete', { scale: [0.5, 0.05, 0.05] });
    expect(withViewRange(big)).toBe(big);
    const own = blockDisplay("Tags:['t']", [0, 0, 0], 'snow_block', { scale: [0.1, 0.1, 0.1], view: 2 });
    expect(withViewRange(own)).toBe(own);
    const text = "summon text_display 0 0 0 {text:'x',transformation:{scale:[0.1f,0.1f,0.1f]}}";
    expect(withViewRange(text)).toBe(text);
    const once =
      'execute positioned 1 2 3 unless entity @e[type=block_display,distance=..0.01] run summon block_display ~ ~ ~ {transformation:{scale:[0.05f,0.05f,0.05f]}}';
    expect(withViewRange(once)).toMatch(/,view_range:0\.25f\}$/);
  });

  it('im Datenpaket der Lobby: jede Anzeige höchstens eine Sichtweite, die kleinen mit', () => {
    const p = lobbyPack();
    const lines = [...Object.values(p.files), ...Object.values(p.seasonFiles)]
      .join('\n')
      .split('\n')
      .filter((l) => /summon (?:block|item)_display/.test(l));
    expect(lines.filter((l) => (l.match(/view_range/g) ?? []).length > 1)).toEqual([]);
    const tiny = lines.filter((l) => /scale:\[0\.0\d+f,0\.0\d+f,0\.0\d+f\]/.test(l));
    expect(tiny.length).toBeGreaterThan(0);
    expect(tiny.filter((l) => !l.includes('view_range'))).toEqual([]);
  }, 120_000);
});
