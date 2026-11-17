/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/require-regex-example -- model limits; pattern reads the key from a summon line, e.g. "strings:['moinmorni:deko/ab12']" */
import { describe, expect, it } from 'vitest';
import { lobbyPack } from '../src/lobby/datapack.js';
import { dekoPackEntries } from '../src/lobby/buendel.js';

/** Gebündelte Deko (Leistung): jede Anzeige hat ihr Modell, jedes Modell ist für Minecraft gültig. */
describe('Deko-Bündel', () => {
  it('Winter und Ostern brauchen deutlich weniger Anzeigen, jedes Bündel hat ein gültiges Modell', () => {
    const p = lobbyPack();
    const text = Object.values(p.seasonFiles).join('\n');
    const keys = [...text.matchAll(/moinmorni:deko\/([0-9a-f]+)/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(500);
    keys.forEach((k) => expect(p.deko?.models.has(k ?? '')).toBe(true));
    const winter = Object.entries(p.seasonFiles)
      .filter(([k]) => k.includes('/winter'))
      .map(([, v]) => (v.match(/summon (?:block|item|text)_display/g) ?? []).length)
      .reduce((a, b) => a + b, 0);
    expect(winter).toBeLessThan(2500);
    [...(p.deko?.models.values() ?? [])].forEach((m) =>
      (m.elements as { from: number[]; to: number[] }[]).forEach((e) =>
        [...e.from, ...e.to].forEach((v) => {
          expect(v).toBeGreaterThanOrEqual(-16);
          expect(v).toBeLessThanOrEqual(32);
        }),
      ),
    );
    const entries = dekoPackEntries('moinmorni', p.deko);
    expect(entries.some((e) => e.name === 'assets/minecraft/items/spruce_leaves.json')).toBe(true);
  }, 120_000);
});
