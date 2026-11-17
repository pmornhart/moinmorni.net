/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/no-loop-statements -- test: ZIP reader and model limits */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { clothingPreview, garment, HAT_BUILDERS } from '@moinmorni/builder';
import { ANGEL_CLOTHES } from '@moinmorni/shared';
import { netzPackInfo } from '../src/packs/netz.js';

/** Dateien im (ungepackten) ZIP. */
function zipFiles(zip: Buffer): Map<string, Buffer> {
  const LOCAL = 0x04034b50;
  const HEADER = 30;
  const files = new Map<string, Buffer>();
  let at = 0;
  while (zip.readUInt32LE(at) === LOCAL) {
    const size = zip.readUInt32LE(at + 18);
    const nameLen = zip.readUInt16LE(at + 26);
    const extra = zip.readUInt16LE(at + 28);
    const name = zip.subarray(at + HEADER, at + HEADER + nameLen).toString('utf8');
    const start = at + HEADER + nameLen + extra;
    files.set(name, zip.subarray(start, start + size));
    at = start + size;
  }
  return files;
}

const pngSize = (png: Buffer): { width: number; height: number } => ({
  width: png.readUInt32BE(16),
  height: png.readUInt32BE(20),
});

interface Element {
  from: number[];
  to: number[];
  rotation?: { angle: number; axis: string; origin: number[] };
  faces: Record<string, { uv: number[]; texture: string }>;
}
interface Model {
  textures: { t: string };
  elements: Element[];
  display: Record<string, unknown>;
}

const HATS = ANGEL_CLOTHES.filter((c) => c.slot === 'head');
const BODY = ANGEL_CLOTHES.filter((c) => c.slot !== 'head');
/** Minecraft erlaubt für Element-Drehungen nur diese Winkel. */
const ANGLES = [-45, -22.5, 0, 22.5, 45];

describe('Angelkönig: Hüte und Kleidung mit eigenem Aussehen', () => {
  const files = zipFiles(netzPackInfo().bytes);
  const model = (id: string): Model =>
    JSON.parse(files.get(`assets/moinmorni/models/item/kleidung/${id}.json`)?.toString() ?? '{}') as Model;

  test('jedes Stück hat ein Modell, Texturen im Paket, gültige Elemente', () => {
    expect(Object.keys(HAT_BUILDERS).sort()).toEqual(HATS.map((c) => c.id).sort());
    ANGEL_CLOTHES.forEach((c) => {
      const m = model(c.id);
      expect(m.elements.length, c.id).toBeGreaterThan(0);
      const tex = m.textures.t.replace('moinmorni:', 'assets/moinmorni/textures/') + '.png';
      expect(files.has(tex), `${c.id}: ${tex}`).toBe(true);
      m.elements.forEach((e) => {
        [...e.from, ...e.to].forEach((n) => expect(n, c.id).toBeGreaterThanOrEqual(-16));
        [...e.from, ...e.to].forEach((n) => expect(n, c.id).toBeLessThanOrEqual(32));
        e.from.forEach((n, k) => expect(n, c.id).toBeLessThanOrEqual(e.to[k] ?? 0));
        if (e.rotation) expect(ANGLES, c.id).toContain(e.rotation.angle);
        Object.values(e.faces).forEach((f) => {
          expect(f.texture).toBe('#t');
          f.uv.forEach((u) => expect(u).toBeGreaterThanOrEqual(0));
          f.uv.forEach((u) => expect(u).toBeLessThanOrEqual(16));
        });
      });
      expect(m.display['gui'], c.id).toBeDefined();
    });
  });

  test('Hüte sitzen auf dem Kopf: Krone deckt den Kopf samt zweiter Skin-Ebene, nichts hängt ins Gesicht', () => {
    HATS.forEach((c) => {
      const m = model(c.id);
      const plain = m.elements.filter((e) => !e.rotation);
      // Kopf 1,6 … 14,4, zweite Ebene 0,8 … 15,2: irgendein Teil der Krone reicht über die zweite Ebene hinaus
      const crown = plain.filter((e) => (e.from[0] ?? 99) <= 0.8 && (e.to[0] ?? 0) >= 15.2);
      expect(crown.length, c.id).toBeGreaterThan(0);
      const lowest = Math.min(...plain.map((e) => e.from[1] ?? 99));
      expect(lowest, c.id).toBeGreaterThan(10.4); // Augen liegen bei etwa 8–10
      expect(Math.max(...m.elements.map((e) => e.to[1] ?? 0)), c.id).toBeGreaterThan(17); // Hut steht über dem Kopf
      expect(m.display['head'], c.id).toBeDefined();
    });
  });

  test('Königskrone glänzt: zwölf Bilder mit Lichtstreif, Bildfolge im Paket', () => {
    const tex = files.get('assets/moinmorni/textures/item/kleidung/koenigskrone.png') as Buffer;
    const { width, height } = pngSize(tex);
    expect(height).toBe(width * 12);
    expect(files.has('assets/moinmorni/textures/item/kleidung/koenigskrone.png.mcmeta')).toBe(true);
    expect(files.has('assets/moinmorni/textures/item/kleidung/fischerhut.png.mcmeta')).toBe(false);
  });

  test('Weste, Jacke, Hosen, Stiefel: eigenes Aussehen am Körper (Rüstungs-Raster 64 × 32) und 3D-Bild im Inventar', () => {
    BODY.forEach((c) => {
      const layer = c.slot === 'legs' ? 'humanoid_leggings' : 'humanoid';
      const eq = JSON.parse(
        files.get(`assets/moinmorni/equipment/kleidung/${c.id}.json`)?.toString() ?? '{}',
      ) as {
        layers: Record<string, Array<{ texture: string }>>;
      };
      expect(eq.layers, c.id).toEqual({ [layer]: [{ texture: `moinmorni:kleidung/${c.id}` }] });
      const png = files.get(`assets/moinmorni/textures/entity/equipment/${layer}/kleidung/${c.id}.png`);
      expect(png, c.id).toBeDefined();
      expect(pngSize(png as Buffer), c.id).toEqual({ width: 64, height: 32 });
      expect(model(c.id).textures.t, c.id).toBe(`moinmorni:item/kleidung/${c.id}_koerper`);
      expect(garment(c.id).layer, c.id).toBe(layer);
    });
    // Hüte haben kein Rüstungs-Aussehen: Minecraft zeigt dann das 3D-Modell auf dem Kopf
    HATS.forEach((c) =>
      expect(files.has(`assets/moinmorni/equipment/kleidung/${c.id}.json`), c.id).toBe(false),
    );
  });

  test('ohne Namen des Stücks bleibt der Minecraft-Gegenstand (Leder in seiner Farbe)', () => {
    ['leather_helmet', 'leather_chestplate', 'leather_leggings', 'leather_boots'].forEach((base) => {
      const def = JSON.parse(files.get(`assets/minecraft/items/${base}.json`)?.toString() ?? '{}') as {
        model: { fallback: { model: string; tints?: unknown[] } };
      };
      expect(def.model.fallback.model).toBe(`minecraft:item/${base}`);
      expect(def.model.fallback.tints, base).toHaveLength(1);
    });
    const gold = JSON.parse(files.get('assets/minecraft/items/golden_helmet.json')?.toString() ?? '{}') as {
      model: { cases: Array<{ when: string }>; fallback: { model: string } };
    };
    expect(gold.model.cases.map((c) => c.when)).toEqual(['moinmorni:kleidung/koenigskrone']);
    expect(gold.model.fallback.model).toBe('minecraft:item/golden_helmet');
  });

  test('Bilder der Webseite = Vorschau aus dem Paket (sonst: npx tsx apps/server/scripts/kleidung-bilder.ts)', () => {
    const dir = path.resolve(import.meta.dirname, '../../web/public/bilder');
    const seen = new Set<string>();
    ANGEL_CLOTHES.forEach((c) => {
      const file = path.join(dir, `kleidung-${c.id}.png`);
      expect(fs.existsSync(file), file).toBe(true);
      const bytes = fs.readFileSync(file);
      expect(bytes.equals(clothingPreview(c.id, 160).png()), c.id).toBe(true);
      expect(seen.has(bytes.toString('base64')), c.id).toBe(false);
      seen.add(bytes.toString('base64'));
    });
  }, 60_000);
});
