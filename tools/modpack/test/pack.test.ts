/* eslint-disable ts-patterns/no-magic-numbers -- sizes and offsets of the ZIP format and made-up file sizes */
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { readNbt, serversDat } from '../src/nbt.js';
import {
  indexProblems,
  mrpack,
  packIndex,
  packVersion,
  type ModrinthIndex,
  type PackMod,
} from '../src/pack.js';

function mod(slug: string, overrides: Partial<PackMod> = {}): PackMod {
  const data = Buffer.from(`inhalt von ${slug}`);
  return {
    projectId: `id-${slug}`,
    slug,
    title: slug,
    versionId: `v-${slug}`,
    versionNumber: '1.0.0',
    versionType: 'release',
    license: 'MIT',
    licenseUrl: null,
    file: {
      url: `https://cdn.modrinth.com/data/id-${slug}/versions/v-${slug}/${slug}.jar`,
      filename: `${slug}.jar`,
      primary: true,
      size: data.length,
      hashes: {
        sha1: createHash('sha1').update(data).digest('hex'),
        sha512: createHash('sha512').update(data).digest('hex'),
      },
    },
    env: { client: 'required', server: 'unsupported' },
    spec: undefined,
    neededBy: [],
    ...overrides,
  };
}

function index(mods: readonly PackMod[]): ModrinthIndex {
  return packIndex({
    versionId: '26.3-2026.11.14',
    name: 'MoinMorni',
    summary: 'Test',
    minecraft: '26.3',
    loader: 'fabric',
    loaderVersion: '0.20.1',
    mods,
  });
}

interface ZipItem {
  readonly name: string;
  readonly data: Buffer;
}

/** Mini-Leser für ungepackte ZIP-Dateien: geht die lokalen Einträge der Reihe nach durch. */
function unzipStored(zip: Buffer, offset = 0): ZipItem[] {
  if (zip.readUInt32LE(offset) !== 0x04034b50) return [];
  expect(zip.readUInt16LE(offset + 8)).toBe(0); // 0 = ungepackt
  const size = zip.readUInt32LE(offset + 18);
  const nameLength = zip.readUInt16LE(offset + 26);
  const extraLength = zip.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const item = {
    name: zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8'),
    data: zip.subarray(start, start + size),
  };
  return [item, ...unzipStored(zip, start + size)];
}

describe('modrinth.index.json', () => {
  test('hat alle Pflichtfelder des Modrinth-Formats', () => {
    const result = index([
      mod('sodium'),
      mod('fabric-api', { env: { client: 'required', server: 'required' } }),
    ]);
    expect(result.formatVersion).toBe(1);
    expect(result.game).toBe('minecraft');
    expect(result.versionId).toBe('26.3-2026.11.14');
    expect(result.name).toBe('MoinMorni');
    expect(result.dependencies).toEqual({ minecraft: '26.3', 'fabric-loader': '0.20.1' });
    expect(result.files.map((f) => f.path)).toEqual(['mods/fabric-api.jar', 'mods/sodium.jar']);
    result.files.forEach((f) => {
      expect(f.hashes.sha1).toHaveLength(40);
      expect(f.hashes.sha512).toHaveLength(128);
      expect(f.downloads[0]?.startsWith('https://cdn.modrinth.com/')).toBe(true);
      expect(f.fileSize).toBeGreaterThan(0);
      expect(Object.keys(f.env).sort()).toEqual(['client', 'server']);
    });
    expect(indexProblems(result)).toEqual([]);
  });

  test('erkennt unsichere Pfade, fremde Download-Seiten, falsche Prüfsummen und Doppelte', () => {
    const good = index([mod('sodium')]);
    const [file] = good.files;
    if (file === undefined) throw new Error('keine Datei');
    const broken: ModrinthIndex = {
      ...good,
      files: [
        { ...file, path: '../../.minecraft/evil.jar' },
        { ...file, path: 'mods/a.jar', downloads: ['https://example.com/a.jar'] },
        { ...file, path: 'mods/b.jar', hashes: { sha1: 'abc', sha512: file.hashes.sha512 } },
        { ...file, path: 'mods/c.jar' },
        { ...file, path: 'mods/c.jar' },
      ],
    };
    const problems = indexProblems(broken);
    expect(problems.some((p) => p.includes('evil.jar') && p.includes('Pfad'))).toBe(true);
    expect(problems.some((p) => p.includes('a.jar') && p.includes('erlaubten Seite'))).toBe(true);
    expect(problems.some((p) => p.includes('b.jar') && p.includes('sha1'))).toBe(true);
    expect(problems.some((p) => p.includes('doppelte Pfade: mods/c.jar'))).toBe(true);
  });

  test('ohne Lader oder Dateien gibt es Meldungen', () => {
    const empty: ModrinthIndex = {
      ...index([mod('sodium')]),
      files: [],
      dependencies: { minecraft: '26.3' },
    };
    expect(indexProblems(empty)).toEqual(['Lader fehlt in dependencies', 'keine Dateien']);
  });
});

describe('.mrpack', () => {
  test('ZIP mit Index und Serverliste unter overrides/', () => {
    const idx = index([mod('sodium')]);
    const pack = mrpack(idx, [
      { path: 'servers.dat', data: serversDat([{ name: 'MoinMorni', ip: 'moinmorni.net' }]) },
    ]);
    const items = unzipStored(pack);
    expect(items.map((i) => i.name)).toEqual(['modrinth.index.json', 'overrides/servers.dat']);
    expect(JSON.parse(items[0]?.data.toString('utf8') ?? '')).toEqual(idx);
    const servers = readNbt(items[1]?.data ?? Buffer.alloc(0)).root;
    expect(JSON.stringify(servers)).toContain('moinmorni.net');
  });

  test('gleiche Eingabe ergibt dieselben Bytes', () => {
    const idx = index([mod('sodium')]);
    expect(mrpack(idx, [])).toEqual(mrpack(idx, []));
  });

  test('unsichere Pfade in overrides werden abgelehnt', () => {
    expect(() => mrpack(index([mod('sodium')]), [{ path: '../options.txt', data: Buffer.alloc(1) }])).toThrow(
      'Unsicherer Pfad',
    );
  });

  test('Version = Minecraft-Version + Tag', () => {
    expect(packVersion('26.3', new Date('2026-11-14T23:30:00Z'))).toBe('26.3-2026.11.14');
  });
});
