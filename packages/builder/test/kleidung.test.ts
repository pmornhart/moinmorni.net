/* eslint-disable ts-patterns/no-magic-numbers -- test: pixel positions in the 64 × 32 armour layout */
import { describe, expect, it } from 'vitest';
import { fishPack } from '../src/fische/paket.js';
import { HAT_BUILDERS } from '../src/kleidung/huete.js';
import { garment, GARMENT_BUILDERS, sideRect, type BodyPart, type Side } from '../src/kleidung/ruestung.js';
import { clothingPreview } from '../src/kleidung/bilder.js';

/** Wie viele Pixel einer Seite gefärbt sind (0 … 1). */
function cover(id: string, part: BodyPart, side: Side, rows?: [number, number]): number {
  const pic = garment(id).texture;
  const [x, y, w, h] = sideRect(part, side);
  const [r0, r1] = rows ?? [0, h];
  const cells = Array.from({ length: w * (r1 - r0) }, (_, i) => {
    const px = x + (i % w);
    const py = y + r0 + Math.floor(i / w);
    return (pic.data[(py * pic.width + px) * 4 + 3] ?? 0) > 0;
  });
  return cells.filter(Boolean).length / cells.length;
}

describe('Kleidung im Angelkönig: eigene Modelle und Muster', () => {
  it('vier Hüte und fünf Stücke für den Körper', () => {
    expect(Object.keys(HAT_BUILDERS)).toEqual(['fischerhut', 'strohhut', 'trachtenhut', 'koenigskrone']);
    expect(Object.keys(GARMENT_BUILDERS)).toEqual([
      'anglerweste',
      'regenjacke',
      'lederhose',
      'wathose',
      'gummistiefel',
    ]);
  });

  it('Weste ohne Ärmel, Jacke mit Ärmeln, kurze Lederhose, Wathose bis zu den Füßen, Stiefel nur unten', () => {
    expect(cover('anglerweste', 'body', 'front')).toBeGreaterThan(0.95);
    expect(cover('anglerweste', 'arm', 'front')).toBe(0);
    expect(cover('regenjacke', 'arm', 'outer')).toBe(1);
    expect(cover('lederhose', 'leg', 'front', [0, 6])).toBe(1);
    expect(cover('lederhose', 'leg', 'front', [8, 12])).toBe(0);
    expect(cover('wathose', 'leg', 'front')).toBe(1);
    expect(cover('gummistiefel', 'leg', 'front', [6, 12])).toBe(1);
    expect(cover('gummistiefel', 'leg', 'front', [0, 6])).toBe(0);
    expect(cover('gummistiefel', 'body', 'front')).toBe(0);
    expect(garment('lederhose').layer).toBe('humanoid_leggings');
    expect(garment('gummistiefel').layer).toBe('humanoid');
  });

  it('Hüte: Textur passt in den Atlas, die Krone hat zwölf Bilder', () => {
    Object.entries(HAT_BUILDERS).forEach(([id, build]) => {
      const m = build();
      expect(m.texture.width, id).toBeLessThanOrEqual(256);
      expect(m.texture.height, id).toBe(m.texture.width * m.frames);
      expect(m.frames, id).toBe(id === 'koenigskrone' ? 12 : 1);
    });
  });

  it('gleiche Modelle bei jedem Aufruf (gleiche Bytes, gleiche SHA-1 des Pakets)', () => {
    const clothes = [
      { id: 'fischerhut', base: 'leather_helmet' },
      { id: 'anglerweste', base: 'leather_chestplate' },
    ];
    expect(fishPack([], clothes).equals(fishPack([], clothes))).toBe(true);
    expect(clothingPreview('strohhut', 48).png().equals(clothingPreview('strohhut', 48).png())).toBe(true);
  });
});
