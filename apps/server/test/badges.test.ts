/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import crypto from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, test } from 'vitest';
import { DEFAULT_ROLES, JAIL_BADGE, badgeKeys, type Role } from '@moinmorni/shared';
import {
  BADGE_PACK_PATH,
  badgePackOf,
  badgePackUrl,
  buildBadgePack,
  registerBadgeRoutes,
} from '../src/badges/pack.js';
import type { Api } from '../src/app.js';

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

const SUPPORTER: Role = {
  id: 'supporter',
  name: { de: 'Supporter', en: 'Supporter' },
  symbol: '✚',
  colour: '#22c55e',
  panel: [],
  game: [],
  discord: [],
  position: 3,
  fallback: false,
};

/** Rang der Reihe nach durchzählen (0, 1, 2 …), wie das Panel die Reihenfolge speichert. */
const numbered = (roles: readonly Role[]): Role[] => roles.map((r, i) => ({ ...r, position: i }));
/** Die sieben Rollen ohne Supporter – egal, ob die Vorlage ihn schon mitbringt (Supporter-Branch). */
const base = (): Role[] => numbered(DEFAULT_ROLES.filter((r) => r.id !== 'supporter'));
/** Dieselben Rollen mit Supporter zwischen Moderator und Builder – eine Rolle, die im Panel dazukommt. */
const withSupporter = (): Role[] => {
  const roles = base();
  const after = roles.findIndex((r) => r.id === 'moderator') + 1;
  return numbered([...roles.slice(0, after), SUPPORTER, ...roles.slice(after)]);
};

interface Provider {
  readonly type: string;
  readonly file: string;
  readonly ascent: number;
  readonly height: number;
  readonly chars: string[];
}

const read = (items: ZipItem[], name: string): Buffer => {
  const item = items.find((i) => i.name === name);
  expect(item, name).toBeDefined();
  return item!.data;
};
const json = <T>(items: ZipItem[], name: string): T => JSON.parse(read(items, name).toString('utf8')) as T;

describe('Abzeichen-Paket', () => {
  test('gleiche Ränge = gleiche Bytes = gleiche SHA-1; Name, Symbol oder Farbe geändert → neue SHA-1', () => {
    const a = buildBadgePack(base());
    const b = buildBadgePack(base().map((r) => ({ ...r })));
    expect(a.bytes.equals(b.bytes)).toBe(true);
    expect(a.sha1).toBe(crypto.createHash('sha1').update(a.bytes).digest('hex'));
    const changed = (patch: Partial<Role>): string =>
      buildBadgePack(base().map((r) => (r.id === 'vip' ? { ...r, ...patch } : r))).sha1;
    expect(changed({ colour: '#ff0000' })).not.toBe(a.sha1);
    expect(changed({ symbol: '❤' })).not.toBe(a.sha1);
    expect(changed({ name: { de: 'Stammgast', en: 'Regular' } })).not.toBe(a.sha1);
    // Rechte ändern nichts am Bild.
    expect(changed({ game: [] })).toBe(a.sha1);
    // Neue Rolle aus dem Panel (Supporter, ✚) → neues Paket.
    expect(buildBadgePack(withSupporter()).sha1).not.toBe(a.sha1);
  });

  test('Schrift wie in MorniCraft: Bitmap-Zeichen auf eigenen Zeichen, 9 hoch, Bilder liegen im Paket', () => {
    const items = unzipStored(buildBadgePack(base()).bytes);
    const meta = json<{ pack: Record<string, unknown> }>(items, 'pack.mcmeta').pack;
    expect(meta).toMatchObject({ pack_format: 15, min_format: 15, max_format: 999 });
    const font = json<{ providers: Provider[] }>(items, 'assets/minecraft/font/default.json');
    // 7 Rollen, Spieler/Player zweimal, Gefängnis/Jail zweimal.
    expect(font.providers).toHaveLength(10);
    font.providers.forEach((p, i) => {
      expect(p).toMatchObject({ type: 'bitmap', ascent: 8, height: 9 });
      expect(p.ascent).toBeLessThanOrEqual(p.height);
      expect(p.chars).toEqual([String.fromCodePoint(0xe900 + i)]);
      // "moinmorni:font/abzeichen/0.png" → assets/moinmorni/textures/font/abzeichen/0.png
      const [ns, path] = p.file.split(':');
      const png = read(items, `assets/${ns}/textures/${path}`);
      expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
      expect(png.readUInt32BE(20)).toBe(9); // Höhe aus dem IHDR
    });
  });

  test('Sprachdateien übersetzen jeden Schlüssel in ein weißes Zeichen; Deutsch hat eigene Namen', () => {
    const roles = withSupporter();
    const items = unzipStored(buildBadgePack(roles).bytes);
    const en = json<Record<string, string>>(items, 'assets/moinmorni/lang/en_us.json');
    const de = json<Record<string, string>>(items, 'assets/moinmorni/lang/de_de.json');
    const keys = badgeKeys(roles);
    expect(Object.keys(en).sort()).toEqual([...Object.values(keys), JAIL_BADGE.key].sort());
    // Weiß, ein eigenes Zeichen ab U+E900, Leerzeichen: passt auf "§f ", nicht auf "§c" oder "♛ ".
    // https://regex101.com/?flavor=javascript&regex=%5E%C2%A7f%5B%5Cue900-%5Cue9ff%5D%20%24&flags=u&testString=%C2%A7f%EE%A4%80%20
    const WHITE_GLYPH = /^§f[-] $/u;
    Object.values(en).forEach((v) => expect(v).toMatch(WHITE_GLYPH));
    // Owner heißt überall gleich → dasselbe Zeichen; Spieler/Player und Gefängnis/Jail nicht.
    expect(de['♛ ']).toBe(en['♛ ']);
    expect(de['']).not.toBe(en['']);
    expect(de[JAIL_BADGE.key]).not.toBe(en[JAIL_BADGE.key]);
    expect(en['✚ ']).toBeDefined();
    ['de_at', 'de_ch'].forEach((lang) =>
      expect(json<Record<string, string>>(items, `assets/moinmorni/lang/${lang}.json`)).toEqual(de),
    );
  });

  test('Paket wird nur neu gebaut, wenn sich die Ränge ändern; Adresse nur mit Domain', () => {
    const first = badgePackOf(base());
    expect(badgePackOf(base().map((r) => ({ ...r })))).toBe(first);
    expect(badgePackOf(withSupporter())).not.toBe(first);
    expect(badgePackUrl('moinmorni.net', 'abc')).toBe(`https://moinmorni.net${BADGE_PACK_PATH}?v=abc`);
    expect(badgePackUrl(' ', 'abc')).toBeNull();
  });

  test('die Webseite liefert das Paket zu den aktuellen Rollen', async () => {
    const app = Fastify();
    const state = { roles: base() as readonly Role[] };
    registerBadgeRoutes(app as unknown as Api, () => state.roles);
    const res = await app.inject({ method: 'GET', url: `${BADGE_PACK_PATH}?v=egal` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.rawPayload.equals(buildBadgePack(base()).bytes)).toBe(true);
    state.roles = withSupporter();
    const after = await app.inject({ method: 'GET', url: BADGE_PACK_PATH });
    expect(after.headers['etag']).toBe(`"${buildBadgePack(withSupporter()).sha1}"`);
    await app.close();
  });
});
