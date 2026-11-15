import { describe, expect, test } from 'vitest';
import { CAST } from '../src/cast.js';
import { airItemDefinition, bodyParts, trachtItems, trachtModels } from '../src/trachten.js';

describe('Trachten in 3D', () => {
  test('Dirndl hat Rock, Schürze und Mieder; Lederhose hat Hosenträger; sitzend kein Körper', () => {
    const dirndl = Object.values(CAST).find((o) => o.bodice !== undefined && o.apron !== undefined);
    expect(dirndl).toBeDefined();
    expect(bodyParts(dirndl!)).toEqual(expect.arrayContaining(['rock', 'schuerze', 'mieder']));
    expect(trachtItems(dirndl!).body).toContain("'minecraft:item_model':'minecraft:air'");
    expect(trachtItems(dirndl!, true).body).toBeNull();
    const braces = Object.values(CAST).find((o) => o.braces !== undefined);
    expect(bodyParts(braces!)).toContain('hosentraeger');
  });

  test('alle Modelle bleiben im erlaubten Bereich (−16 … 32) und jede Frisur/jeder Hut der Figuren hat ein Modell', () => {
    const models = trachtModels();
    Object.values(models).forEach((m) =>
      (m['elements'] as { from: number[]; to: number[] }[]).forEach((e) =>
        [...e.from, ...e.to].forEach((v) => {
          expect(v).toBeGreaterThanOrEqual(-16);
          expect(v).toBeLessThanOrEqual(32);
        }),
      ),
    );
    Object.values(CAST).forEach((o) => {
      if (o.hairStyle !== 'bald') expect(models[`haar_${o.hairStyle}`]).toBeDefined();
      if (o.hat) expect(models[`hut_${o.hat.kind}`]).toBeDefined();
    });
    expect(JSON.stringify(airItemDefinition())).toContain('minecraft:item/air');
  });
});
