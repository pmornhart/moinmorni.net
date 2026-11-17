import { describe, expect, test } from 'vitest';
import { CAST, PENDING_CAST } from '../src/cast.js';
import { MODE_FIGURES } from '../src/figuren.js';
import { airItemDefinition, bodyParts, trachtItems, trachtModels } from '../src/trachten.js';

interface Element {
  readonly from: readonly number[];
  readonly to: readonly number[];
}
const elementsOf = (m: Record<string, unknown>): Element[] => m['elements'] as Element[];
const ALL = [...Object.values(CAST), ...Object.values(PENDING_CAST)];
/** Kopf: [1,6 … 14,4]; die zweite Ebene des Skins liegt 0,8 außerhalb (0,8 bzw. 15,2). */
const OVERLAY_PLANES = [0.8, 15.2];
/** Unterkante der dritten Reihe von oben (so weit malt der Skin einen Hut). */
const ROW_2_BOTTOM = 1.6 + 5 * 1.6;

describe('Trachten in 3D', () => {
  test('Dirndl: Rock und Schürze; Zöpfe und langes Haar am Rücken; sitzend kein Körper-Teil', () => {
    const dirndl = ALL.find((o) => o.bodice !== undefined && o.apron !== undefined);
    expect(bodyParts(dirndl!)).toEqual(expect.arrayContaining(['rock', 'schuerze']));
    expect(trachtItems(dirndl!).body).toContain("'minecraft:item_model':'minecraft:air'");
    expect(trachtItems(dirndl!, true).body).toBeNull();
    expect(bodyParts(ALL.find((o) => o.hairStyle === 'braids')!)).toContain('zoepfe');
    expect(bodyParts(ALL.find((o) => o.hairStyle === 'long')!)).toContain('haar_lang');
    // Flaches malt der Skin: Lederhose mit Hosenträgern und Weste haben keinen Körper-Teil
    const bua = CAST['wirt']!;
    expect(bodyParts(bua)).toEqual([]);
    expect(trachtItems(bua).body).toBeNull();
  });

  test('alle Modelle im erlaubten Bereich (−16 … 32), jeder Hut, Bart und Dutt der Figuren hat ein Modell', () => {
    const models = trachtModels();
    Object.values(models).forEach((m) =>
      elementsOf(m).forEach((e) =>
        [...e.from, ...e.to].forEach((v) => {
          expect(v).toBeGreaterThanOrEqual(-16);
          expect(v).toBeLessThanOrEqual(32);
        }),
      ),
    );
    ALL.forEach((o) => {
      if (o.hat) expect(models[`hut_${o.hat.kind}`]).toBeDefined();
      if (o.hairStyle === 'bun') expect(models[o.hat ? 'haar_bun_low' : 'haar_bun']).toBeDefined();
      if (o.beard !== undefined) expect(models['bart']).toBeDefined();
    });
    expect(JSON.stringify(airItemDefinition())).toContain('minecraft:item/air');
  });

  test('nichts am Kopf liegt auf der zweiten Ebene des Skins (sonst flimmert es)', () => {
    const models = trachtModels();
    Object.entries(models)
      .filter(([name]) => !name.startsWith('koerper_'))
      .forEach(([name, m]) =>
        elementsOf(m).forEach((e) =>
          [...e.from, ...e.to].forEach((v) =>
            OVERLAY_PLANES.forEach((plane) => expect(Math.abs(v - plane), name).toBeGreaterThan(0.05)),
          ),
        ),
      );
  });

  test('Hüte umschließen die gemalten Hutreihen (Wände außerhalb der zweiten Ebene, bis unter die dritte Reihe)', () => {
    const models = trachtModels();
    [
      'tyrol',
      'straw',
      'chef',
      'beanie',
      'cap',
      'helmet',
      'aviator',
      'ranger',
      'feather',
      'climb',
      'kettle',
      'tophat',
      'bowler',
      'pickel',
      'skibeanie',
      'bucket',
    ].forEach((hat) => {
      const shell = elementsOf(models[`hut_${hat}`]!).find(
        (e) =>
          e.from[0]! < 0.8 &&
          e.to[0]! > 15.2 &&
          e.from[2]! < 0.8 &&
          e.to[2]! > 15.2 &&
          e.from[1]! <= ROW_2_BOTTOM + 0.4 &&
          e.to[1]! > 15.2,
      );
      expect(shell, hat).toBeDefined();
      // Krempe oder Wand reicht bis unter die dritte Reihe
      const lowest = Math.min(...elementsOf(models[`hut_${hat}`]!).map((e) => e.from[1]!));
      expect(lowest, hat).toBeLessThanOrEqual(ROW_2_BOTTOM);
    });
  });

  test('Körper-Teile stecken nicht in den Armen (Arme x 0…4 und 12…16, Höhe 12…24)', () => {
    const models = trachtModels();
    Object.entries(models)
      .filter(([name]) => name.startsWith('koerper_'))
      .forEach(([name, m]) =>
        elementsOf(m)
          .filter((e) => e.to[1]! > 12 && e.from[1]! < 24)
          .forEach((e) => {
            const behind = e.from[2]! >= 9.9;
            const between = e.from[0]! >= 3.85 && e.to[0]! <= 12.15;
            // Schulterstücke liegen oben auf den Armen (über der zweiten Ebene bei 24,25), neben dem Kopf
            const onTop = e.from[1]! >= 24.3 && (e.to[0]! <= 3.45 || e.from[0]! >= 12.55);
            expect(behind || between || onTop, `${name} ${JSON.stringify(e)}`).toBe(true);
          }),
      );
  });

  test('Modus-Figuren: jede hat eine eigene Kopfbedeckung, ein Kostüm und ihre 3D-Teile', () => {
    const figures = Object.entries(MODE_FIGURES);
    const hats = figures.map(([, o]) => o.hat?.kind);
    expect(new Set(hats).size, hats.join(',')).toBe(figures.length);
    figures.forEach(([id, o]) => expect(o.costume, id).toBeDefined());
    expect(bodyParts(MODE_FIGURES.burgverlies)).toContain('umhang');
    expect(bodyParts(MODE_FIGURES.gipfelsturm)).toContain('seil');
    expect(bodyParts(MODE_FIGURES.adlerflug)).toEqual(expect.arrayContaining(['fluegel', 'schal']));
    expect(bodyParts(MODE_FIGURES.wintersport)).toContain('skier');
    expect(bodyParts(MODE_FIGURES.duels)).toContain('schulter');
    expect(bodyParts(MODE_FIGURES.wolkenkampf)).toEqual(expect.arrayContaining(['schal', 'zoepfe']));
  });
});
