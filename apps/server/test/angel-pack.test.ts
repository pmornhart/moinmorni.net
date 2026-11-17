import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';
import { ANGEL_PACK_ID, FISH_ART_IDS, fishPack, fishPicture } from '@moinmorni/builder';
import {
  ANGEL_BASE_ITEMS,
  ANGEL_CLOTHES,
  ANGEL_FISH,
  ANGEL_MODEL_NAMES,
  DEFAULT_MODES,
} from '@moinmorni/shared';
import {
  ANGEL_MODE,
  ANGEL_PACK_FILE,
  ANGEL_PACK_JSON,
  ANGEL_PACK_MARKER,
  dropServerPack,
} from '../src/angelkoenig/pack.js';
import { withoutOwnPack } from '../src/lobby/world.js';
import { netzPackInfo } from '../src/packs/netz.js';

/** Nur der Angelkönig-Teil (wie früher das eigene Paket). */
const angelPackBytes = (): Buffer =>
  fishPack(
    ANGEL_FISH.map((f) => ({ id: f.id, base: f.base })),
    ANGEL_CLOTHES.map((c) => ({ id: c.id, base: c.base })),
  );
import { readServerFile, writeServerFile } from '../src/motor/files.js';
import { createProvisioner } from '../src/network/provision.js';
import { createHarness, type Harness } from './harness.js';

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;

interface Net {
  readonly name: string;
  readonly members: Array<{ serverId: string; name: string }>;
}

/** Dateien im (ungepackten) ZIP – genug, um das Paket zu prüfen. */
function zipFiles(zip: Buffer): Map<string, Buffer> {
  const LOCAL = 0x04034b50;
  const HEADER = 30;
  const files = new Map<string, Buffer>();
  let at = 0;
  while (zip.readUInt32LE(at) === LOCAL) {
    const size = zip.readUInt32LE(at + 18);
    const nameLen = zip.readUInt16LE(at + 26);
    const extra = zip.readUInt16LE(at + 28);
    const name = zip.subarray(at + HEADER, at + HEADER + nameLen).toString('utf8');
    const start = at + HEADER + nameLen + extra;
    files.set(name, zip.subarray(start, start + size));
    at = start + size;
  }
  return files;
}

/** Breite, Höhe und Pixel (RGBA) eines PNG aus dem Paket. */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function pngPixels(png: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let at = 8;
  while (at < png.length) {
    const len = png.readUInt32BE(at);
    if (png.toString('ascii', at + 4, at + 8) === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + len));
    at += len + 12;
  }
  return zlib.inflateSync(Buffer.concat(chunks));
}

describe('Angelkönig: eigene Fisch-Zeichnungen als Paket', () => {
  let h: Harness | null = null;
  afterEach(async () => {
    await h?.cleanup();
    h = null;
  });

  test('jede Art hat eine Zeichnung, Namen wie in Angelkönig', () => {
    expect([...FISH_ART_IDS].sort()).toEqual(ANGEL_FISH.map((f) => f.id).sort());
    expect(ANGEL_MODEL_NAMES).toContain('moinmorni:fisch/hecht');
    expect(new Set(ANGEL_MODEL_NAMES).size).toBe(ANGEL_FISH.length);
  });

  test('Paket: Modell und Textur je Art, Grund-Gegenstände mit Minecraft als Rückfall, Legenden bewegt', () => {
    const files = zipFiles(angelPackBytes());
    expect(files.has('pack.mcmeta')).toBe(true);
    const bases = [...new Set([...ANGEL_BASE_ITEMS, ...ANGEL_CLOTHES.map((c) => c.base)])];
    bases.forEach((base) => {
      const def = JSON.parse(files.get(`assets/minecraft/items/${base}.json`)?.toString() ?? '{}') as {
        model: {
          type: string;
          property: string;
          cases: Array<{ when: string }>;
          fallback: { model: string };
        };
      };
      expect(def.model.type).toBe('minecraft:select');
      expect(def.model.property).toBe('minecraft:custom_model_data');
      expect(def.model.fallback.model).toBe(`minecraft:item/${base}`);
      expect(def.model.cases.map((c) => c.when).sort()).toEqual(
        [
          ...ANGEL_FISH.filter((f) => f.base === base).map((f) => `moinmorni:fisch/${f.id}`),
          ...ANGEL_CLOTHES.filter((c) => c.base === base).map((c) => `moinmorni:kleidung/${c.id}`),
        ].sort(),
      );
    });
    // Nur die Gegenstände der Fänge und der Kleidung – sonst ändert das Paket nichts.
    const items = [...files.keys()].filter((n) => n.startsWith('assets/minecraft/'));
    expect(items.sort()).toEqual(bases.map((b) => `assets/minecraft/items/${b}.json`).sort());
    const leather = JSON.parse(
      files.get('assets/minecraft/items/leather_boots.json')?.toString() ?? '{}',
    ) as {
      model: { fallback: { tints?: unknown[] } };
    };
    expect(leather.model.fallback.tints).toHaveLength(1);

    ANGEL_FISH.forEach((f) => {
      const model = JSON.parse(
        files.get(`assets/moinmorni/models/item/fisch/${f.id}.json`)?.toString() ?? '{}',
      ) as {
        textures: { layer0: string };
      };
      expect(model.textures.layer0).toBe(`moinmorni:item/fisch/${f.id}`);
      const png = files.get(`assets/moinmorni/textures/item/fisch/${f.id}.png`);
      expect(png, f.id).toBeDefined();
      const { width, height } = pngSize(png as Buffer);
      expect(width).toBe(32);
      const animated = files.has(`assets/moinmorni/textures/item/fisch/${f.id}.png.mcmeta`);
      expect(animated, f.id).toBe(f.rarity === 'legendary');
      expect(height).toBe(animated ? width * 12 : width);
    });
  });

  test('Zeichnungen: nichts abgeschnitten, jede Art sieht anders aus, durchsichtiger Hintergrund', () => {
    const files = zipFiles(angelPackBytes());
    const seen = new Set<string>();
    ANGEL_FISH.forEach((f) => {
      const png = files.get(`assets/moinmorni/textures/item/fisch/${f.id}.png`) as Buffer;
      const raw = pngPixels(png);
      const size = 32;
      const stride = size * 4 + 1;
      const alpha = (x: number, y: number): number => raw[y * stride + 1 + x * 4 + 3] ?? 0;
      const filled = Array.from({ length: size * size }, (_, i) =>
        alpha(i % size, Math.floor(i / size)),
      ).filter((a) => a > 0).length;
      expect(filled, f.id).toBeGreaterThan(size * size * 0.12);
      expect(filled, f.id).toBeLessThan(size * size * 0.7);
      // Kein Pixel am äußersten Rand: nichts ist abgeschnitten (Fundstücke dürfen bis an den Rand)
      if (f.rarity !== 'junk') {
        const edge = Array.from({ length: size }, (_, i) => [
          alpha(i, 0),
          alpha(i, size - 1),
          alpha(0, i),
          alpha(size - 1, i),
        ]).flat();
        expect(
          edge.every((a) => a === 0),
          f.id,
        ).toBe(true);
      }
      const first = raw.subarray(0, size * stride).toString('base64');
      expect(seen.has(first), f.id).toBe(false);
      seen.add(first);
    });
  });

  test('Bilder der Webseite = Zeichnungen im Paket (sonst: npx tsx apps/server/scripts/fische-bilder.ts)', () => {
    const dir = path.resolve(import.meta.dirname, '../../web/public/bilder');
    ANGEL_FISH.forEach((f) => {
      const file = path.join(dir, `fisch-${f.id}.png`);
      expect(fs.existsSync(file), file).toBe(true);
      expect(fs.readFileSync(file).equals(fishPicture(f.id)), f.id).toBe(true);
    });
  });

  test('gleiche Zeichnungen = gleiche Bytes (Minecraft lädt nur bei neuer SHA-1 neu)', () => {
    expect(angelPackBytes().equals(angelPackBytes())).toBe(true);
    // Im Netzwerk-Paket stecken dieselben Gegenstände.
    const net = zipFiles(netzPackInfo().bytes);
    const own = zipFiles(angelPackBytes());
    [...own.keys()]
      .filter((n) => n.startsWith('assets/moinmorni/'))
      .forEach((n) => expect(net.get(n)?.equals(own.get(n) as Buffer), n).toBe(true));
  });

  test('server.properties: das frühere Angelkönig-Paket kommt heraus, ein fremdes bleibt', () => {
    const old = `motd=Angeln\nresource-pack=https\\://moinmorni.net/api/public/packs/angelkoenig.zip\nresource-pack-id=${ANGEL_PACK_ID}\n`;
    const off = withoutOwnPack(old);
    expect(off.changed).toBe(true);
    expect(off.text).toContain('resource-pack=\n');
    expect(off.text).toContain('motd=Angeln');
    expect(withoutOwnPack(off.text).changed).toBe(false);
    const foreign = 'resource-pack=https://example.org/x.zip\nresource-pack-id=1234\n';
    expect(withoutOwnPack(foreign)).toEqual({ text: foreign, changed: false });
  });

  test('Provisioner: kein Spielserver bietet ein eigenes Paket an; Angelkönig bekommt paket.json „vom Netzwerk“', async () => {
    h = await createHarness();
    const motor = h.mm.motor;
    const provisioner = createProvisioner(h.mm.config, motor, h.mm.hub, quiet, {
      proxyAddOns: {},
      lobbyAddOns: {},
      buildContent: false,
      versions: { paper: '1.21.4', velocity: '3.4.0' },
      modes: () => DEFAULT_MODES,
      releases: {
        latest: async (repo) =>
          repo.endsWith('morni-angelkoenig') || repo.endsWith('MoinMorni-Duels')
            ? { repo, tag: 'v1.0.0', fileName: 'x.jar', bytes: Buffer.from('jar') }
            : null,
      },
      configureMode: (serverId, member) => dropServerPack(motor, serverId, member),
    });
    const first = await provisioner.ensure();
    expect(first.created).toContain(ANGEL_MODE);
    const nets = await motor.request<Net[]>('GET', '/api/networks');
    const members = nets.find((n) => n.name === 'MoinMorni')?.members ?? [];
    const angelId = members.find((m) => m.name === ANGEL_MODE)?.serverId ?? '';
    const props = async (): Promise<string> =>
      (await readServerFile(motor, angelId, 'server.properties')) ?? '';
    // Wie eine Installation von gestern: Paket in der server.properties, Angelkönig 0.2.1 liest paket.json.
    await writeServerFile(
      motor,
      angelId,
      'server.properties',
      `${await props()}resource-pack=https\\://moinmorni.net/api/public/packs/angelkoenig.zip\nresource-pack-id=${ANGEL_PACK_ID}\n`,
    );
    await writeServerFile(motor, angelId, ANGEL_PACK_MARKER, 'ja\n');
    await writeServerFile(
      motor,
      angelId,
      ANGEL_PACK_FILE,
      '{"url":"https://moinmorni.net/api/public/packs/angelkoenig.zip"}\n',
    );
    const second = await provisioner.ensure();
    expect(second.restart.map((r) => r.member)).toContain(ANGEL_MODE);
    expect(await props()).not.toContain(`resource-pack-id=${ANGEL_PACK_ID}`);
    expect(await readServerFile(motor, angelId, ANGEL_PACK_FILE)).toBe(ANGEL_PACK_JSON);
    expect(JSON.parse(ANGEL_PACK_JSON)).toEqual({ netz: true });
    const third = await provisioner.ensure();
    expect(third.restart.map((r) => r.member)).not.toContain(ANGEL_MODE);
  });
});
