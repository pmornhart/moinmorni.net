import { describe, expect, test } from 'vitest';
import { Canvas } from '../src/canvas.js';
import { CAST, CAST_TEXTURES, signedSkin } from '../src/cast.js';
import { npc } from '../src/village.js';

describe('Figuren der Lobby', () => {
  test('jede Tracht ist signiert und die Signatur passt zum aktuellen Bild', () => {
    // Schlägt das fehl, wurde eine Tracht geändert: tsx tools/lobby-entwuerfe/src/sign-skins.ts
    const stale = Object.keys(CAST).filter((id) => signedSkin(id) === null);
    expect(stale).toEqual([]);
    expect(Object.keys(CAST_TEXTURES).sort()).toEqual(Object.keys(CAST).sort());
  });

  test('Figuren tragen den signierten Skin (kein Texturpaket nötig)', () => {
    const c = new Canvas();
    npc(c, { x: 0, y: 65, z: 0, look: 'south', skin: 'wirt' });
    npc(c, { x: 2, y: 65, z: 0, look: 'north', skin: 'gast1', sit: true });
    expect(c.extra[0]).toContain("profile:{properties:[{name:'textures',value:'");
    expect(c.extra[0]).not.toContain('moinmorni:npc/');
    expect(c.extra[1]).toMatch(/^summon block_display .*Passengers:\[\{id:'minecraft:mannequin'/); // eslint-disable-line ts-patterns/require-regex-example -- seated figure rides a display: "summon block_display … Passengers:[{id:'minecraft:mannequin'"
  });
});
