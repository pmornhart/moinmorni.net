import { describe, expect, test } from 'vitest';
import { Canvas } from '../src/canvas.js';
import { CAST, CAST_TEXTURES, PENDING_CAST, STAND_IN, castFor, signedSkin } from '../src/cast.js';
import { npc } from '../src/village.js';

describe('Figuren der Lobby', () => {
  test('jede Tracht ist signiert und die Signatur passt zum aktuellen Bild', () => {
    // Schlägt das fehl, wurde eine Tracht geändert: tsx tools/lobby-entwuerfe/src/sign-skins.ts
    const stale = Object.keys(CAST).filter((id) => signedSkin(id) === null);
    expect(stale).toEqual([]);
    const known = [...Object.keys(CAST), ...Object.keys(PENDING_CAST)];
    expect(Object.keys(CAST_TEXTURES).filter((id) => !known.includes(id))).toEqual([]);
  });

  test('neue Figuren: bis zur Signatur steht eine passende, signierte Figur da – Skin und Tracht zusammen', () => {
    Object.keys(PENDING_CAST).forEach((id) => {
      const standIn = STAND_IN[id];
      expect(standIn && signedSkin(standIn), id).toBeTruthy();
      const wears = castFor(id);
      if (signedSkin(id)) expect(wears).toEqual({ id, outfit: PENDING_CAST[id] });
      else expect(wears).toEqual({ id: standIn, outfit: CAST[standIn!] });
    });
    const c = new Canvas();
    npc(c, { x: 0, y: 65, z: 0, look: 'south', skin: 'angelkoenig', tags: ['mm_mode_angelkoenig'] });
    expect(c.extra[0]).toContain("profile:{properties:[{name:'textures',value:'");
    expect(c.extra[0]).toContain('mm_skin_angelkoenig');
  });

  test('Figuren tragen den signierten Skin (kein Texturpaket nötig)', () => {
    const c = new Canvas();
    npc(c, { x: 0, y: 65, z: 0, look: 'south', skin: 'wirt' });
    npc(c, { x: 2, y: 65, z: 0, look: 'north', skin: 'gast1', sit: true });
    expect(c.extra[0]).toContain("profile:{properties:[{name:'textures',value:'");
    expect(c.extra[0]).not.toContain('morninet:npc/');
    expect(c.extra[1]).toMatch(/^summon block_display .*Passengers:\[\{id:'minecraft:mannequin'/); // eslint-disable-line ts-patterns/require-regex-example -- seated figure rides a display: "summon block_display … Passengers:[{id:'minecraft:mannequin'"
  });
});
