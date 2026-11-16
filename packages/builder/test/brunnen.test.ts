import { describe, expect, it } from 'vitest';
import { brunnenBoxes, brunnenModels, brunnenTeile, BRUNNEN_ERSATZ, MODEL_REACH } from '../src/brunnen.js';
import { furniturePack } from '../src/furniture.js';
import { buildLobby } from '../src/lobby/dorfplatz.js';

const ALLOWED = new Set([-45, -22.5, 0, 22.5, 45]);

describe('Prunkbrunnen (Modelle im Ressourcenpaket)', () => {
  it('jedes Modell bleibt im erlaubten Raum (-16 … 32), Drehungen nur in 22,5°-Schritten', () => {
    Object.entries(brunnenBoxes()).forEach(([name, boxes]) => {
      expect(boxes.length, name).toBeGreaterThan(0);
      boxes.forEach((b) => {
        [...b.from, ...b.to].forEach((v) => expect(Math.abs(v), `${name}: ${b.from} → ${b.to}`).toBeLessThanOrEqual(MODEL_REACH));
        if (b.rot) expect(ALLOWED.has(b.rot.angle), `${name}: Winkel ${b.rot.angle}`).toBe(true);
      });
    });
  });

  it('Texturausschnitte liegen in 0 … 16, Wasser ist eingefärbt', () => {
    Object.entries(brunnenModels()).forEach(([name, model]) => {
      const elements = (model as { elements: Array<{ faces: Record<string, { uv: number[]; texture: string; tintindex?: number }> }> }).elements;
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
    // Schlosshof (Mitte 0/-112) und Rotunde (Mitte 0/-136): alles innerhalb von 6 Blöcken um eine der beiden
    const near = (x: number, z: number): boolean =>
      Math.hypot(x - 0, z + 112) <= 6 || Math.hypot(x - 0, z + 136) <= 6;
    found.forEach(([x, y, z, b]) => expect(near(x, z), `${b} bei ${x} ${y} ${z}`).toBe(true));
  }, 60_000);

  it('das Paket enthält Modelle, Luft-Auswahl und die ausgeblendeten Blöcke', () => {
    const zip = furniturePack().toString('latin1');
    expect(zip).toContain('assets/moinmorni/models/item/brunnen/krone.json');
    expect(zip).toContain('assets/minecraft/blockstates/tuff_brick_wall.json');
    expect(zip).toContain('assets/minecraft/blockstates/end_rod.json');
  });
});
