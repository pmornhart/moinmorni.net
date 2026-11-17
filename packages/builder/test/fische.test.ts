import { describe, expect, it } from 'vitest';
import { allFishArt, fishArt, FISH_ART_IDS } from '../src/fische/arten.js';
import { fishPack, itemDefinition } from '../src/fische/paket.js';

const LEGENDS = ['goldforelle', 'seekoenig', 'moorkoenig', 'kristallsaibling'];

describe('Fische im Angelkönig: eigene Zeichnungen', () => {
  it('jede Art 32 × 32, Legenden mit zwölf verschiedenen Bildern', () => {
    allFishArt().forEach((art) => {
      expect(art.size, art.id).toBe(32);
      if (LEGENDS.includes(art.id)) {
        expect(art.frames, art.id).toHaveLength(12);
        const looks = new Set(art.frames.map((f) => Buffer.from(f.color.buffer).toString('base64')));
        expect(looks.size, art.id).toBeGreaterThan(6);
      } else {
        expect(art.frames, art.id).toHaveLength(1);
      }
    });
    expect(FISH_ART_IDS).toHaveLength(23);
  });

  it('gleiche Zeichnung bei jedem Aufruf (darum gleiche SHA-1 des Pakets)', () => {
    const entries = FISH_ART_IDS.map((id) => ({ id, base: 'cod' }));
    expect(fishPack(entries).equals(fishPack(entries))).toBe(true);
    expect(fishArt('hecht')).toBe(fishArt('hecht'));
  });

  it('Gegenstand ohne Namen einer Art bleibt der Minecraft-Gegenstand', () => {
    const def = itemDefinition('salmon', ['huchen']) as {
      model: { cases: Array<{ when: string; model: { model: string } }>; fallback: { model: string } };
    };
    expect(def.model.cases).toEqual([
      {
        when: 'moinmorni:fisch/huchen',
        model: { type: 'minecraft:model', model: 'moinmorni:item/fisch/huchen' },
      },
    ]);
    expect(def.model.fallback.model).toBe('minecraft:item/salmon');
  });

  it('Kristallsaibling ist durchscheinend, die anderen Fische nicht', () => {
    const glassy = (id: string): number => {
      const f = fishArt(id).frames[0]!;
      return Array.from(f.alpha).filter((a) => a > 0 && a < 255).length;
    };
    expect(glassy('kristallsaibling')).toBeGreaterThan(100);
    expect(glassy('hecht')).toBe(0);
  });
});
