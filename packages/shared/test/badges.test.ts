/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { describe, expect, test } from 'vitest';
import {
  BADGE_HEIGHT,
  DEFAULT_ROLES,
  JAIL_BADGE,
  badgeIconOf,
  badgeKeys,
  badgeLetters,
  BADGE_TILE,
  drawBadge,
  drawBadgeTile,
  type Role,
} from '../src/index.js';

/** Eine Rolle wie im Panel, nur mit dem, was ein Abzeichen braucht. */
const role = (id: string, symbol: string, position: number, colour = '#55ff55'): Role => ({
  id,
  name: { de: id, en: id },
  symbol,
  colour,
  panel: [],
  game: [],
  discord: [],
  position,
  fallback: false,
});

/** RGBA eines Pixels. */
const pixel = (p: { width: number; rgba: Uint8Array }, x: number, y: number): number[] => [
  ...p.rgba.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4),
];

describe('Rang-Abzeichen', () => {
  test('Schlüssel: Symbol + Leerzeichen, ohne Symbol leer, gleiche Symbole bekommen ein Leerzeichen mehr', () => {
    const defaults = badgeKeys(DEFAULT_ROLES);
    expect(defaults).toMatchObject({
      owner: '♛ ',
      admin: '✦ ',
      moderator: '⚔ ',
      builder: '⚒ ',
      media: '▶ ',
      vip: '★ ',
      player: '',
    });
    // Jede Rolle der Vorlage hat einen Schlüssel (auch eine, die später dazukommt).
    expect(Object.keys(defaults).sort()).toEqual(DEFAULT_ROLES.map((r) => r.id).sort());
    // Reihenfolge nach Rang, nicht nach Liste: der obere Rang behält den kurzen Schlüssel.
    const keys = badgeKeys([role('zwei', '♛', 5), role('eins', '♛', 1), role('a', '', 7), role('b', ' ', 8)]);
    expect(keys).toEqual({ eins: '♛ ', zwei: '♛  ', a: '', b: ' ' });
    // Das Gefängnis hat seinen eigenen Schlüssel, den kein Rang bekommt.
    expect(Object.values(badgeKeys([role('x', JAIL_BADGE.key.trim(), 0)]))).not.toContain(JAIL_BADGE.key);
  });

  test('Rolle aus dem Panel mit ✚ (Supporter, grün) bekommt das Plus und ein eigenes Abzeichen', () => {
    // Egal, ob die Vorlage den Supporter schon hat: genau einer, so wie ihn das Panel speichert.
    const roles = [
      ...DEFAULT_ROLES.filter((r) => r.id !== 'supporter'),
      { ...role('supporter', '✚', 3, '#22c55e'), name: { de: 'Supporter', en: 'Supporter' } },
    ];
    expect(badgeKeys(roles)['supporter']).toBe('✚ ');
    expect(badgeIconOf('✚')).toBe('plus');
    const badge = drawBadge({ text: 'Supporter', symbol: '✚', colour: '#22c55e' });
    expect(badge?.height).toBe(BADGE_HEIGHT);
    // Mitte des Plus ist weiß (Symbol beginnt 2 Pixel vom Rand, eine Reihe unter der Oberkante).
    expect(pixel(badge!, 2 + 3, 1 + 3)).toEqual([255, 255, 255, 255]);
  });

  test('jedes Symbol, das das Panel vorschlägt, und die Kette haben ein eigenes Bild; unbekannte den Edelstein', () => {
    ['♛', '✦', '⚔', '⚒', '▶', '★', '✿', '☘', '⚡', '❤', '✚', '⛓'].forEach((s) =>
      expect(badgeIconOf(s), s).not.toBe('gem'),
    );
    expect(badgeIconOf('☃')).toBe('gem');
    expect(badgeIconOf('')).toBeNull();
    expect(badgeIconOf('  ')).toBeNull();
  });

  test('Schild: 9 Pixel hoch, Ecken frei, Linie in der Rangfarbe unten, Name weiß', () => {
    const owner = drawBadge({ text: 'Owner', symbol: '♛', colour: '#ff5555' })!;
    // 2 Rand + 7 Krone + 2 Luft + OWNER (O 3, W 5, N 4, E 3, R 3 Pixel, 4 Abstände) + 2 Rand
    expect(owner.width).toBe(2 + 7 + 2 + 18 + 4 + 2);
    expect(owner.height).toBe(9);
    expect(owner.rgba.length).toBe(owner.width * 9 * 4);
    // Oberste und unterste Reihe bleiben leer (zwei Chat-Zeilen berühren sich nicht), Ecken abgerundet.
    expect(pixel(owner, 5, 0)[3]).toBe(0);
    expect(pixel(owner, 5, 8)[3]).toBe(0);
    expect(pixel(owner, 0, 1)[3]).toBe(0);
    expect(pixel(owner, owner.width - 1, 7)[3]).toBe(0);
    // Schild = halbe Rangfarbe, Linie unten = volle Rangfarbe.
    expect(pixel(owner, owner.width - 2, 3)).toEqual([128, 43, 43, 255]);
    expect(pixel(owner, owner.width - 2, 7)).toEqual([255, 85, 85, 255]);
    // „O“ beginnt nach Krone und Luft, erste Reihe der Schrift ist Reihe 2.
    expect(pixel(owner, 11, 2)).toEqual([255, 255, 255, 255]);
  });

  test('Spieler ohne Symbol: nur der Name; nichts zu zeigen → kein Bild', () => {
    const player = drawBadge({ text: 'Spieler', symbol: '', colour: '#aaaaaa' })!;
    // SPIELER: 7 Buchstaben zu 3 Pixeln, 6 Abstände
    expect(player.width).toBe(2 + 21 + 6 + 2);
    expect(drawBadge({ text: '☃☃', symbol: '', colour: '#aaaaaa' })).toBeNull();
    // Nur ein Symbol, kein Name: ohne Luft hinter dem Symbol.
    expect(drawBadge({ text: '', symbol: '★', colour: '#ffd23f' })?.width).toBe(2 + 7 + 2);
  });

  test('Buchstaben: groß, Umlaute bleiben, Akzente fallen weg, höchstens 16', () => {
    expect(badgeLetters('Gefängnis').join('')).toBe('GEFÄNGNIS');
    expect(badgeLetters('Média').join('')).toBe('MEDIA');
    expect(badgeLetters('Straße').join('')).toBe('STRASSE');
    expect(badgeLetters('VIP★').join('')).toBe('VIP');
    expect(badgeLetters('abcdefghijklmnopqrstuvwxyz')).toHaveLength(16);
  });

  test('jede Rolle der Vorlage und das Gefängnis lassen sich zeichnen – auf Deutsch und Englisch', () => {
    [
      ...DEFAULT_ROLES.flatMap((r) => [
        { text: r.name.de, symbol: r.symbol, colour: r.colour },
        { text: r.name.en, symbol: r.symbol, colour: r.colour },
      ]),
      { text: JAIL_BADGE.name.de, symbol: JAIL_BADGE.symbol, colour: JAIL_BADGE.colour },
      { text: JAIL_BADGE.name.en, symbol: JAIL_BADGE.symbol, colour: JAIL_BADGE.colour },
    ].forEach((look) => {
      const p = drawBadge(look);
      expect(p, look.text).not.toBeNull();
      // Minecraft erlaubt Schrift-Bilder bis 256 Pixel Breite.
      expect(p!.width).toBeLessThanOrEqual(256);
    });
  });

  test('Kachel für Discord: quadratisch, runde Ecken, goldener Rahmen, Ring in der Rangfarbe, Symbol doppelt so groß', () => {
    const tile = drawBadgeTile({ symbol: '✚', colour: '#22c55e' });
    expect(tile).not.toBeNull();
    expect([tile!.width, tile!.height]).toEqual([BADGE_TILE, BADGE_TILE]);
    // Ecken außen leer (durchsichtig), Rahmen oben links hell-golden, unten rechts dunkler.
    expect(pixel(tile!, 0, 0)[3]).toBe(0);
    expect(pixel(tile!, BADGE_TILE - 1, BADGE_TILE - 1)[3]).toBe(0);
    expect(pixel(tile!, 13, 0)).toEqual([255, 218, 92, 255]);
    expect(pixel(tile!, 13, BADGE_TILE - 1)).toEqual([196, 142, 28, 255]);
    // Ring in der Farbe des Rangs, innen 32 % davon.
    expect(pixel(tile!, 13, 1)).toEqual([0x22, 0xc5, 0x5e, 255]);
    expect(pixel(tile!, 4, 4)).toEqual([
      Math.round(0x22 * 0.32),
      Math.round(0xc5 * 0.32),
      Math.round(0x5e * 0.32),
      255,
    ]);
    // Das Plus: die weiße Mitte des Symbols, 2 × 2 Pixel groß.
    const at = Math.floor((BADGE_TILE - 14) / 2);
    expect(pixel(tile!, at + 3 * 2, at + 3 * 2)).toEqual([255, 255, 255, 255]);
    expect(pixel(tile!, at + 3 * 2 + 1, at + 3 * 2 + 1)).toEqual([255, 255, 255, 255]);
    // Ohne Symbol keine Kachel; jede Rolle der Vorlage mit Symbol hat eine.
    expect(drawBadgeTile({ symbol: '', colour: '#aaaaaa' })).toBeNull();
    DEFAULT_ROLES.filter((r) => r.symbol.trim()).forEach((r) =>
      expect(drawBadgeTile(r), r.id).not.toBeNull(),
    );
  });
});
