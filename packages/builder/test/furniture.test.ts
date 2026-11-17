/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { describe, expect, it } from 'vitest';
import {
  FURNITURE_MODELS,
  MOEBEL,
  furnitureItems,
  furniturePack,
  modelJson,
  moebelCommand,
  moebelOf,
} from '../src/furniture.js';

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

  it('jedes Möbelstück hat ein Modell und die richtige Richtung', () => {
    const names = new Set(Object.keys(FURNITURE_MODELS));
    const blocks = [
      ...['north', 'east', 'south', 'west'].flatMap((f) => [MOEBEL.stuhl(f), MOEBEL.eckbank(f)]),
      MOEBEL.wirtstisch,
      MOEBEL.hocker,
      MOEBEL.bierbank,
      MOEBEL.biertisch,
      ...([1, 2, 3, 4] as const).map(MOEBEL.krug),
    ];
    blocks.forEach((b) => {
      const m = moebelOf(b);
      expect(m, b).not.toBeNull();
      expect(names.has(m?.name ?? ''), b).toBe(true);
    });
    expect(moebelOf(MOEBEL.stuhl('east'))?.turn).toBe(90);
    expect(moebelOf(MOEBEL.eckbank('west'))).toMatchObject({ name: 'eckbank', turn: 270, block: 'barrier' });
    expect(moebelOf(MOEBEL.krug(3))).toMatchObject({ name: 'krug_3', item: 'air', block: 'air' });
    expect(moebelOf('mangrove_slab[type=double]')).toBeNull();
    expect(moebelOf('oak_stairs[facing=north]')).toBeNull();
  });

  it('die Anzeige dreht wie früher der Blockzustand (Item-Anzeigen sind 180° gedreht)', () => {
    const cmd = moebelCommand(10, 64, -3, moebelOf(MOEBEL.stuhl('east'))!, "'mm_moebel'");
    expect(cmd).toContain('positioned 10.5 64.5 -2.5');
    expect(cmd).toContain('Rotation:[270f,0f]');
    expect(cmd).toContain("id:'minecraft:mangrove_stairs'");
    expect(cmd).toContain("strings:['moinmorni:moebel/stuhl']");
    const krug = moebelCommand(0, 65, 0, moebelOf(MOEBEL.krug(2))!, "'mm_moebel'");
    expect(krug).toContain("'minecraft:item_model':'minecraft:air'");
  });

  it('Gegenstände sehen ohne unseren Namen genau aus wie in Minecraft', () => {
    const items = furnitureItems() as Record<
      string,
      { model: { cases: { when: string }[]; fallback: unknown } }
    >;
    expect(items['mangrove_stairs']?.model.fallback).toEqual({
      type: 'minecraft:model',
      model: 'minecraft:block/mangrove_stairs',
    });
    expect(items['tuff_brick_wall']?.model.fallback).toEqual({
      type: 'minecraft:model',
      model: 'minecraft:block/tuff_brick_wall_inventory',
    });
    expect(items['mangrove_stairs']?.model.cases.map((c) => c.when).sort()).toEqual([
      'moinmorni:moebel/eckbank',
      'moinmorni:moebel/stuhl',
    ]);
    expect(items['birch_slab']?.model.cases.map((c) => c.when).sort()).toEqual([
      'moinmorni:moebel/bierbank',
      'moinmorni:moebel/biertisch',
    ]);
  });
});
