import { describe, expect, it } from 'vitest';
import { brunnenBoxes, brunnenModels, brunnenTeile, BRUNNEN_ERSATZ, MODEL_REACH } from '../src/brunnen.js';
import { dorfbrunnenBoxes, dorfbrunnenModels, dorfbrunnenTeile } from '../src/dorfbrunnen.js';
import { furniturePack } from '../src/furniture.js';
import { buildLobby, VILLAGE_FOUNTAINS } from '../src/lobby/dorfplatz.js';

const ALLOWED = new Set([-45, -22.5, 0, 22.5, 45]);

describe('Prunkbrunnen (Modelle im Ressourcenpaket)', () => {
  it('jedes Modell bleibt im erlaubten Raum (-16 … 32), Drehungen nur in 22,5°-Schritten', () => {
    Object.entries(brunnenBoxes()).forEach(([name, boxes]) => {
      expect(boxes.length, name).toBeGreaterThan(0);
      boxes.forEach((b) => {
        [...b.from, ...b.to].forEach((v) =>
          expect(Math.abs(v), `${name}: ${b.from} → ${b.to}`).toBeLessThanOrEqual(MODEL_REACH),
        );
        if (b.rot) expect(ALLOWED.has(b.rot.angle), `${name}: Winkel ${b.rot.angle}`).toBe(true);
      });
    });
  });

  it('Texturausschnitte liegen in 0 … 16, Wasser ist eingefärbt', () => {
    Object.entries(brunnenModels()).forEach(([name, model]) => {
      const elements = (
        model as {
          elements: Array<{ faces: Record<string, { uv: number[]; texture: string; tintindex?: number }> }>;
        }
      ).elements;
      elements.forEach((e) =>
        Object.values(e.faces).forEach((f) => {
          f.uv.forEach((v) => {
            expect(v, name).toBeGreaterThanOrEqual(0);
            expect(v, name).toBeLessThanOrEqual(16);
          });
          if (f.texture === '#wasser') expect(f.tintindex, name).toBe(0);
          if (f.texture === '#flut') expect(f.tintindex, name).toBe(1);
        }),
      );
    });
  });

  it('Teile stehen weit genug auseinander (sonst setzt die Lobby ein Teil beim Wiederholen nicht)', () => {
    (['gross', 'klein'] as const).forEach((size) => {
      const teile = brunnenTeile(size, 0.5, 65, 0.5);
      teile.forEach((a, i) =>
        teile.slice(i + 1).forEach((b) => {
          const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
          expect(d, `${size}: ${a.name} / ${b.name}`).toBeGreaterThan(0.31);
        }),
      );
      const models = brunnenModels();
      teile.forEach((t) => expect(models[t.name], t.name).toBeDefined());
    });
  });

  it('Ersatz-Blöcke (mit Paket unsichtbar) gibt es in der Lobby nur an den Brunnen', () => {
    const { canvas } = buildLobby();
    const ersatz = Object.values(BRUNNEN_ERSATZ).map((b) => b.split('[')[0]);
    const found = canvas.find((b) => ersatz.includes(b.split('[')[0] ?? ''));
    expect(found.length).toBeGreaterThan(20);
    // Schlosshof (Mitte 0/-112), Rotunde (Mitte 0/-136) und die Dorfbrunnen: alles innerhalb von 6 Blöcken um einen
    const near = (x: number, z: number): boolean =>
      Math.hypot(x - 0, z + 112) <= 6 ||
      Math.hypot(x - 0, z + 136) <= 6 ||
      VILLAGE_FOUNTAINS.some(([fx, fz]) => Math.hypot(x - fx, z - fz) <= 3);
    found.forEach(([x, y, z, b]) => expect(near(x, z), `${b} bei ${x} ${y} ${z}`).toBe(true));
  }, 300_000);

  it('das Paket enthält Modelle, Luft-Auswahl und die ausgeblendeten Blöcke', () => {
    const zip = furniturePack().toString('latin1');
    expect(zip).toContain('assets/moinmorni/models/item/brunnen/dorf_trog_a.json');
    expect(zip).toContain('dorf_speier');
    expect(zip).toContain('assets/moinmorni/models/item/brunnen/krone.json');
    expect(zip).toContain('assets/minecraft/blockstates/tuff_brick_wall.json');
    expect(zip).toContain('assets/minecraft/blockstates/end_rod.json');
  });
});

describe('Dorfbrunnen (Gasse, Oberdorf)', () => {
  it('Modelle im erlaubten Raum, Drehungen in 22,5°-Schritten, Wasser eingefärbt', () => {
    Object.entries(dorfbrunnenBoxes()).forEach(([name, boxes]) => {
      expect(boxes.length, name).toBeGreaterThan(0);
      boxes.forEach((b) => {
        [...b.from, ...b.to].forEach((v) =>
          expect(Math.abs(v), `${name}: ${b.from} → ${b.to}`).toBeLessThanOrEqual(MODEL_REACH),
        );
        if (b.rot) expect(ALLOWED.has(b.rot.angle), `${name}: Winkel ${b.rot.angle}`).toBe(true);
      });
    });
    Object.entries(dorfbrunnenModels()).forEach(([name, model]) => {
      const elements = (
        model as {
          elements: Array<{ faces: Record<string, { uv: number[]; texture: string; tintindex?: number }> }>;
        }
      ).elements;
      elements.forEach((e) =>
        Object.values(e.faces).forEach((f) => {
          f.uv.forEach((v) => expect(v >= 0 && v <= 16, `${name}: uv ${f.uv}`).toBe(true));
          if (f.texture === '#flut') expect(f.tintindex, name).toBe(1);
        }),
      );
    });
  });

  it('Teile stehen weit genug auseinander (summonOnce setzt sonst eines nicht)', () => {
    const teile = dorfbrunnenTeile(0.5, 65, 0.5);
    expect(teile.length).toBe(14);
    teile.forEach((a, i) =>
      teile.slice(i + 1).forEach((b) => {
        expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), `${a.name} / ${b.name}`).toBeGreaterThan(0.31);
      }),
    );
  });

  it('kein Quarz-Pilz mehr: Becken aus Mauer mit Wasser, Säule, Töpfe auf dem Rand, Beete an den Ecken', () => {
    const { canvas } = buildLobby();
    VILLAGE_FOUNTAINS.forEach(([x, z]) => {
      expect(canvas.get(x, 65, z)?.startsWith(BRUNNEN_ERSATZ.rand)).toBe(true);
      expect(canvas.get(x, 68, z)).toBe(BRUNNEN_ERSATZ.fontaene);
      [
        [1, 0],
        [0, 1],
        [-1, -1],
        [1, 1],
      ].forEach(([dx = 0, dz = 0]) => expect(canvas.get(x + dx, 65, z + dz)).toBe('water'));
      [
        [2, 0],
        [0, -2],
      ].forEach(([dx = 0, dz = 0]) =>
        expect(canvas.get(x + dx, 66, z + dz)?.startsWith('potted_')).toBe(true),
      );
      expect(canvas.get(x + 3, 64, z + 3)).toBe('grass_block');
      const quartz = canvas
        .find((b) => b.includes('quartz'))
        .filter(([bx, , bz]) => Math.hypot(bx - x, bz - z) < 5);
      expect(quartz).toEqual([]);
    });
  }, 300_000);
});
