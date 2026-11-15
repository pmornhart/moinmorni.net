/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { describe, expect, it } from 'vitest';
import { FURNITURE_MODELS, furnitureBlockstates, furniturePack, modelJson } from '../src/furniture.js';

const MODEL_MIN = -16;
const MODEL_MAX = 32;

describe('Möbel-Paket', () => {
  it('gleiche Möbel ergeben dieselben Bytes (Minecraft lädt nur bei neuer SHA-1 neu)', () => {
    expect(furniturePack().equals(furniturePack())).toBe(true);
  });

  it('jedes Modell bleibt im erlaubten Bereich und nutzt nur Texturen aus dem Spiel', () => {
    Object.entries(FURNITURE_MODELS).forEach(([name, boxes]) => {
      const m = modelJson(boxes) as {
        textures: Record<string, string>;
        elements: Array<{
          from: number[];
          to: number[];
          faces: Record<string, { uv: number[]; texture: string }>;
        }>;
      };
      expect(m.elements.length, name).toBeGreaterThan(0);
      Object.values(m.textures).forEach((t) => expect(t).toMatch(/^minecraft:block\/[a-z_]+$/)); // e.g. "minecraft:block/clay"
      m.elements.forEach((e) => {
        [...e.from, ...e.to].forEach((v) => {
          expect(v).toBeGreaterThanOrEqual(MODEL_MIN);
          expect(v).toBeLessThanOrEqual(MODEL_MAX);
        });
        // Jede Achse hat Ausdehnung – nur die Bodenfläche ist flach (Höhe 0).
        const flat = e.to.filter((v, i) => v === e.from[i]).length;
        e.to.forEach((v, i) => expect(v, name).toBeGreaterThanOrEqual(e.from[i] ?? v));
        expect(flat, name).toBeLessThanOrEqual(1);
        Object.values(e.faces).forEach((f) => {
          f.uv.forEach((v) => {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(16);
          });
          expect(m.textures[f.texture.slice(1)], name).toBeDefined();
        });
      });
    });
  });

  it('jeder Zustand der Möbel-Blöcke hat ein Modell (sonst lila-schwarz)', () => {
    const states = furnitureBlockstates() as Record<string, { variants: Record<string, { model: string }> }>;
    expect(Object.keys(states['mangrove_stairs']?.variants ?? {})).toHaveLength(40);
    expect(Object.keys(states['brown_candle']?.variants ?? {})).toHaveLength(8);
    const names = new Set(Object.keys(FURNITURE_MODELS));
    Object.values(states).forEach((s) =>
      Object.values(s.variants).forEach((v) => {
        const own = v.model.startsWith('moinmorni:block/moebel/');
        if (own) expect(names.has(v.model.replace('moinmorni:block/moebel/', ''))).toBe(true);
        else expect(v.model).toMatch(/^minecraft:block\/(mangrove|birch)_planks$/); // e.g. "minecraft:block/birch_planks"
      }),
    );
  });
});
