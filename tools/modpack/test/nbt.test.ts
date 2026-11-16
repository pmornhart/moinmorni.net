/* eslint-disable ts-patterns/no-magic-numbers -- byte values of the NBT format, written out as the file holds them */
import { describe, expect, test } from 'vitest';
import { modifiedUtf8, readNbt, serversDat, writeNbt } from '../src/nbt.js';

/** Baut erwartete Bytes aus Zahlen und ASCII-Text. */
function bytes(...parts: readonly (number | string)[]): Buffer {
  return Buffer.concat(
    parts.map((p) => (typeof p === 'number' ? Buffer.from([p]) : Buffer.from(p, 'ascii'))),
  );
}

describe('NBT-Schreiber', () => {
  test('servers.dat Byte für Byte wie Minecraft sie schreibt', () => {
    // prettier-ignore
    const expected = bytes(
      0x0a, 0x00, 0x00, // Wurzel: Compound ohne Namen
      0x09, 0x00, 0x07, 'servers', 0x0a, 0x00, 0x00, 0x00, 0x01, // Liste „servers“ mit 1 Compound
      0x08, 0x00, 0x04, 'name', 0x00, 0x09, 'MoinMorni',
      0x08, 0x00, 0x02, 'ip', 0x00, 0x0d, 'moinmorni.net',
      0x00, // Ende des Servers
      0x00, // Ende der Wurzel
    );
    expect(serversDat([{ name: 'MoinMorni', ip: 'moinmorni.net' }])).toEqual(expected);
  });

  test('servers.dat lässt sich wieder einlesen', () => {
    const file = serversDat([
      { name: 'MoinMorni', ip: 'moinmorni.net' },
      { name: 'Grüß Gott 🏔', ip: 'bau.moinmorni.net:25566' },
    ]);
    const { name, root } = readNbt(file);
    expect(name).toBe('');
    expect(root).toEqual({
      kind: 'compound',
      entries: [
        [
          'servers',
          {
            kind: 'list',
            of: 'compound',
            items: [
              {
                kind: 'compound',
                entries: [
                  ['name', { kind: 'string', value: 'MoinMorni' }],
                  ['ip', { kind: 'string', value: 'moinmorni.net' }],
                ],
              },
              {
                kind: 'compound',
                entries: [
                  ['name', { kind: 'string', value: 'Grüß Gott 🏔' }],
                  ['ip', { kind: 'string', value: 'bau.moinmorni.net:25566' }],
                ],
              },
            ],
          },
        ],
      ],
    });
  });

  test('Text im „modified UTF-8“ von Java (Nullzeichen und Emoji)', () => {
    expect(modifiedUtf8('ü')).toEqual(Buffer.from([0xc3, 0xbc]));
    expect(modifiedUtf8('\u0000')).toEqual(Buffer.from([0xc0, 0x80]));
    // 🏔 (U+1F3D4) = zwei Hälften D83C DFD4, jede mit drei Bytes
    expect(modifiedUtf8('🏔')).toEqual(Buffer.from([0xed, 0xa0, 0xbc, 0xed, 0xbf, 0x94]));
  });

  test('alle Zahlenarten und leere Listen', () => {
    const file = writeNbt(
      {
        kind: 'compound',
        entries: [
          ['b', { kind: 'byte', value: -5 }],
          ['s', { kind: 'short', value: 25565 }],
          ['i', { kind: 'int', value: -123456789 }],
          ['leer', { kind: 'list', of: 'end', items: [] }],
        ],
      },
      'Wurzel',
    );
    const { name, root } = readNbt(file);
    expect(name).toBe('Wurzel');
    expect(root.entries.map(([key, tag]) => [key, tag])).toEqual([
      ['b', { kind: 'byte', value: -5 }],
      ['s', { kind: 'short', value: 25565 }],
      ['i', { kind: 'int', value: -123456789 }],
      ['leer', { kind: 'list', of: 'end', items: [] }],
    ]);
  });

  test('kaputte Dateien werden erkannt', () => {
    const good = serversDat([{ name: 'MoinMorni', ip: 'moinmorni.net' }]);
    expect(() => readNbt(good.subarray(0, good.length - 3))).toThrow('zu früh');
    expect(() => readNbt(Buffer.concat([good, Buffer.from([0x00])]))).toThrow('übrig');
    expect(() =>
      writeNbt({
        kind: 'compound',
        entries: [['x', { kind: 'list', of: 'int', items: [{ kind: 'byte', value: 1 }] }]],
      }),
    ).toThrow('Liste');
  });
});
