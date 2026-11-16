import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, test } from 'vitest';
import type { MotorClient } from '../src/motor/client.js';
import { ensureServerIcon, SERVER_ICON } from '../src/network/server-icon.js';

const quiet = { info: () => undefined, warn: () => undefined } as unknown as FastifyBaseLogger;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WIDTH_AT = 16;
const HEIGHT_AT = 20;
const SIZE = 64;

describe('Bild in der Serverliste', () => {
  test('das Wappen ist ein PNG mit 64 × 64 Pixeln, wie Minecraft es braucht', () => {
    expect(SERVER_ICON.subarray(0, PNG.length).equals(PNG)).toBe(true);
    expect(SERVER_ICON.readUInt32BE(WIDTH_AT)).toBe(SIZE);
    expect(SERVER_ICON.readUInt32BE(HEIGHT_AT)).toBe(SIZE);
  });

  test('der Proxy bekommt es nur, solange er keins hat – ein eigenes Bild bleibt', async () => {
    const uploads: string[] = [];
    const motor = (hasIcon: boolean) =>
      ({
        request: () => Promise.resolve({ hasIcon }),
        upload: (id: string, dir: string, name: string) => {
          uploads.push(`${id}:${dir}/${name}`);
          return Promise.resolve();
        },
      }) as unknown as MotorClient;
    expect(await ensureServerIcon(motor(false), 'px1', quiet)).toBe(true);
    expect(uploads).toEqual(['px1:/server-icon.png']);
    expect(await ensureServerIcon(motor(true), 'px1', quiet)).toBe(false);
    expect(uploads).toHaveLength(1);
  });
});
