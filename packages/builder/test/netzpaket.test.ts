import { describe, expect, it } from 'vitest';
import { lobbyPackEntries } from '../src/furniture.js';
import { angelPackEntries } from '../src/fische/paket.js';
import { mergeEntries, netzPack } from '../src/netzpaket.js';
import { buildLobby } from '../src/lobby/dorfplatz.js';
import { toLobbyDisplays } from '../src/lobby/moebel.js';
import { lobbyPack } from '../src/lobby/datapack.js';

const FISH = [
  { id: 'rotauge', base: 'cod' },
  { id: 'goldforelle', base: 'salmon' },
];
const CLOTHES = [{ id: 'trachtenhut', base: 'leather_helmet' }];

describe('Netzwerk-Paket', () => {
  it('gleicher Inhalt ergibt dieselben Bytes (dieselbe SHA-1)', () => {
    const a = netzPack({ fish: FISH, clothes: CLOTHES });
    const b = netzPack({ fish: FISH, clothes: CLOTHES });
    expect(a.equals(b)).toBe(true);
  });

  it('ändert keinen einzigen Blockzustand (es gilt auf jedem Server, auch in MorniSMP und MorniCraft)', () => {
    const names = mergeEntries([lobbyPackEntries(), angelPackEntries(FISH, CLOTHES)]).map((e) => e.name);
    expect(names.filter((n) => n.includes('/blockstates/'))).toEqual([]);
    // Jeder geänderte Minecraft-Gegenstand wählt nur mit unserem Namen etwas anderes, sonst bleibt er wie immer.
    mergeEntries([lobbyPackEntries(), angelPackEntries(FISH, CLOTHES)])
      .filter((e) => e.name.startsWith('assets/minecraft/items/') && !e.name.endsWith('/air.json'))
      .forEach((e) => {
        const item = JSON.parse(e.data.toString()) as {
          model: { type: string; property: string; fallback?: unknown; cases?: { when: unknown }[] };
        };
        expect(item.model.type, e.name).toBe('minecraft:select');
        expect(item.model.property, e.name).toBe('minecraft:custom_model_data');
        expect(item.model.fallback, e.name).toBeDefined();
        (item.model.cases ?? []).forEach((c) =>
          [c.when].flat().forEach((w) => expect(String(w), e.name).toMatch(/^moinmorni:/)),
        );
      });
  });

  it('legt doppelte Gegenstände zusammen und lehnt andere doppelte Dateien ab', () => {
    const item = (when: string): Buffer =>
      Buffer.from(
        JSON.stringify({
          model: {
            type: 'minecraft:select',
            property: 'minecraft:custom_model_data',
            index: 0,
            cases: [{ when, model: {} }],
            fallback: { type: 'minecraft:model', model: 'minecraft:item/cod' },
          },
        }),
      );
    const merged = mergeEntries([
      [{ name: 'assets/minecraft/items/cod.json', data: item('moinmorni:a') }],
      [{ name: 'assets/minecraft/items/cod.json', data: item('moinmorni:b') }],
    ]);
    expect(merged).toHaveLength(1);
    const cases = (JSON.parse(merged[0]!.data.toString()) as { model: { cases: { when: string }[] } }).model
      .cases;
    expect(cases.map((c) => c.when)).toEqual(['moinmorni:a', 'moinmorni:b']);
    expect(() =>
      mergeEntries([
        [{ name: 'pack.png', data: Buffer.alloc(1) }],
        [{ name: 'pack.png', data: Buffer.alloc(1) }],
      ]),
    ).toThrow();
  });

  it('die Lobby baut Möbel und Brunnen-Ersatz als Anzeigen, ohne Platzhalter-Blöcke in der Welt', () => {
    const { canvas } = buildLobby();
    const before = canvas.find((b) => b.startsWith('mangrove_stairs')).length;
    const d = toLobbyDisplays(canvas);
    expect(d.count).toBeGreaterThan(before);
    const left = canvas.find((b) =>
      /^(mangrove_stairs|mangrove_slab\[type=(top|bottom)|birch_slab\[type=(top|bottom)|brown_candle|tuff_brick_wall|end_rod)/.test(
        b,
      ),
    ); // e.g. "brown_candle[candles=2,lit=false]"
    expect(left).toEqual([]);
    d.restore();
    expect(canvas.find((b) => b.startsWith('mangrove_stairs')).length).toBe(before);
    // Im Datenpaket: Anzeigen ja, Platzhalter-Blöcke nein
    const all = Object.values(lobbyPack().files).join('\n');
    expect(all).toContain("strings:['moinmorni:moebel/stuhl']");
    expect(all).not.toMatch(/(setblock|fill) [^\n]*(mangrove_stairs|brown_candle|tuff_brick_wall|end_rod)/);
    // Kugeln und Ostereier: nur noch als Item-Anzeige mit unserem Namen, nie als Block-Anzeige aus Trockenbeton
    const season = Object.values(lobbyPack().seasonFiles).join('\n');
    expect(season).toContain("strings:['moinmorni:kugel']");
    expect(season).not.toMatch(/block_display[^\n]*concrete_powder/);
  });
});
