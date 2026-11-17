/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { arrange, songFingerprint, SONGS_BY_SEASON } from '@moinmorni/builder';
import { LOBBY_SONGS, MUSIC_SEASONS, songSettingKey } from '@moinmorni/shared';
import { openDatabase } from '../src/db/index.js';
import { createHub, type Hub } from '../src/hub/index.js';
import { createEventBus } from '../src/lib/events.js';
import { lobbyMusicBody, musicDir, musicFiles } from '../src/lobby/music.js';
import { netzPackInfo } from '../src/packs/netz.js';
import { createStores, type Stores } from '../src/panel/stores.js';
import { connectPlugin, type FakePlugin, type Msg } from './fake-plugin.js';

/**
 * Lobbymusik: Noten (Baukasten), Liste im Panel (Katalog) und Klangdateien (apps/server/musik) passen zusammen, das
 * Lobby-Paket enthält sie, der Hub schickt die Stücke der Saison und merkt sich /musik je Spieler.
 */

const SECRET = 'test-geheimnis-test-geheimnis-test-geheimnis-1234';
const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  fatal: () => undefined,
  child: () => quiet,
  level: 'silent',
  silent: () => undefined,
} as unknown as FastifyBaseLogger;
const PHILIP = '11111111-1111-1111-1111-111111111111';
const LENA = '22222222-2222-2222-2222-222222222222';
const SETTLE_MS = 120;
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, SETTLE_MS));
/** Größte Nachricht, die der Hub an einen Spielserver schicken soll (der Hub nimmt selbst höchstens 256 KB an). */
const MAX_BODY = 200 * 1024;
const SLOW = 120_000;

describe('Lobbymusik: Noten, Panel und Klangdateien', () => {
  test('jede Saison hat dieselben Stücke in Panel und Baukasten', () => {
    MUSIC_SEASONS.forEach((season) =>
      expect(
        LOBBY_SONGS.filter((s) => s.season === season).map((s) => s.id),
        season,
      ).toEqual(SONGS_BY_SEASON[season].map((s) => s.id)),
    );
  });

  test(
    'jede Klangdatei ist da und passt zu ihren Noten (sonst: npx tsx tools/lobby-musik/src/render.ts)',
    () => {
      const dir = musicDir();
      expect(dir).not.toBeNull();
      const manifest = JSON.parse(readFileSync(path.join(dir ?? '', 'lieder.json'), 'utf8')) as Record<
        string,
        { fingerprint: string; seconds: number }
      >;
      const files = musicFiles();
      Object.values(SONGS_BY_SEASON)
        .flat()
        .forEach((song) => {
          expect(files.has(song.id), `${song.id}.ogg fehlt`).toBe(true);
          expect(files.get(song.id)?.subarray(0, 4).toString('ascii')).toBe('OggS');
          expect(manifest[song.id]?.fingerprint, `${song.id}: Noten geändert – neu rendern`).toBe(
            songFingerprint(arrange(song)),
          );
        });
    },
    SLOW,
  );

  test('das Netzwerk-Paket enthält sounds.json und alle Klangdateien', () => {
    const zip = netzPackInfo().bytes;
    const names = zip.toString('latin1');
    expect(names).toContain('assets/moinmorni/sounds.json');
    LOBBY_SONGS.forEach((s) => expect(names).toContain(`assets/moinmorni/sounds/lobby/musik/${s.id}.ogg`));
    // Die Möbel sind noch drin – als Gegenstände, nie als Blockzustände (das Paket gilt auf allen Servern).
    expect(names).toContain('assets/moinmorni/models/block/moebel/stuhl.json');
    expect(names).not.toContain('assets/minecraft/blockstates/');
  });

  test(
    'die Nachricht je Saison: Einstellungen, nur eingeschaltete Stücke, nicht zu groß',
    () => {
      const handle = openDatabase(':memory:');
      const stores = createStores(handle.db, createEventBus());
      MUSIC_SEASONS.forEach((season) => {
        stores.patchSettings('lobby', { season }, 'test');
        const body = lobbyMusicBody(stores);
        expect(body['season']).toBe(season);
        const songs = body['songs'] as Array<{
          id: string;
          sound: string | null;
          notes: number[];
          ticks: number;
        }>;
        expect(songs.map((s) => s.id)).toEqual(SONGS_BY_SEASON[season].map((s) => s.id));
        songs.forEach((s) => {
          expect(s.sound).toBe(`moinmorni:lobby.musik.${s.id}`);
          expect(s.notes.length % 4).toBe(0);
          expect(s.ticks).toBeGreaterThan(0);
        });
        expect(JSON.stringify(body).length, season).toBeLessThan(MAX_BODY);
      });
      stores.patchSettings(
        'lobby',
        {
          season: 'winter',
          music: false,
          musicVolume: 55,
          musicQuiet: 20,
          musicPause: 9,
          [songSettingKey('stille-nacht')]: false,
        },
        'test',
      );
      const body = lobbyMusicBody(stores);
      expect(body).toMatchObject({ on: false, volume: 55, quiet: 20, pause: 9, season: 'winter' });
      expect((body['songs'] as Array<{ id: string }>).map((s) => s.id)).not.toContain('stille-nacht');
    },
    SLOW,
  );
});

describe('Lobbymusik im Hub', () => {
  let hub: Hub;
  let stores: Stores;
  let url: string;
  const open: FakePlugin[] = [];

  beforeEach(async () => {
    const handle = openDatabase(':memory:');
    const events = createEventBus();
    stores = createStores(handle.db, events);
    hub = createHub({ secret: SECRET, db: handle.db, stores, events, log: quiet, timeZone: 'Europe/Berlin' });
    url = `ws://127.0.0.1:${await hub.listen('127.0.0.1', 0)}/hub`;
  });
  afterEach(async () => {
    open.splice(0).forEach((p) => p.close());
    await hub.close();
  });

  const plugin = async (server: string, kind: 'proxy' | 'backend'): Promise<FakePlugin> => {
    const p = await connectPlugin(url, server, kind, hub.keyFor(server, kind));
    open.push(p);
    return p;
  };
  const profileOf = (
    lobby: FakePlugin,
    uuid: string,
    match: (m: Msg) => boolean = () => true,
  ): Promise<Msg> => lobby.next('profile', (m) => m['uuid'] === uuid && match(m));
  const musicOf = (m: Msg): Record<string, unknown> => m['music'] as Record<string, unknown>;

  test(
    'Lobby bekommt die Stücke der Saison, beim Wechsel im Panel neu',
    async () => {
      stores.patchSettings('lobby', { season: 'wiesn' }, 'test');
      const lobby = await plugin('lobby', 'backend');
      const first = await lobby.next('lobby-music');
      expect(first['season']).toBe('wiesn');
      expect((first['songs'] as Array<{ id: string }>).map((s) => s.id)).toContain('zum-morni-wirt');
      // Andere Spielserver bekommen keine Musik.
      const duels = await plugin('duels', 'backend');
      await settle();
      expect(duels.received.some((m) => m.t === 'lobby-music')).toBe(false);
      stores.patchSettings('lobby', { season: 'halloween' }, 'test');
      const next = await lobby.next('lobby-music', (m) => m['season'] === 'halloween');
      expect((next['songs'] as Array<{ id: string }>).map((s) => s.id)).toContain('bergkoenig');
    },
    SLOW,
  );

  test(
    '/musik an, aus, leiser, lauter, Zahl, weiter – gemerkt und im Profil; das Paket meldet der Proxy',
    async () => {
      const proxy = await plugin('proxy', 'proxy');
      const lobby = await plugin('lobby', 'backend');
      const join = async (uuid: string, name: string, server: string, locale: string): Promise<void> => {
        await proxy.request({ t: 'login', uuid, name, locale, bedrock: false });
        proxy.send({ t: 'switch', uuid, server });
        await settle();
      };
      await join(PHILIP, 'Philip', 'lobby', 'de_de');
      expect(musicOf(await profileOf(lobby, PHILIP))).toEqual({
        on: true,
        volume: 100,
        pack: false,
        skip: 0,
      });
      const musik = (uuid: string, ...args: string[]) =>
        proxy.request({ t: 'command', uuid, command: 'musik', args });
      const said = (uuid: string, part: string) =>
        proxy.next('msg', (m) => m['uuid'] === uuid && String(m['text']).includes(part));

      await musik(PHILIP, 'leiser');
      expect(musicOf(await profileOf(lobby, PHILIP, (m) => musicOf(m)['volume'] === 75))).toMatchObject({
        on: true,
      });
      await said(PHILIP, '75 %');
      await musik(PHILIP, 'leiser');
      await musik(PHILIP, 'leiser');
      await profileOf(lobby, PHILIP, (m) => musicOf(m)['volume'] === 30);
      await musik(PHILIP, 'lauter');
      await profileOf(lobby, PHILIP, (m) => musicOf(m)['volume'] === 50);
      await musik(PHILIP, 'aus');
      await profileOf(lobby, PHILIP, (m) => musicOf(m)['on'] === false);
      await said(PHILIP, 'ist für dich aus');
      await musik(PHILIP, 'an');
      await profileOf(lobby, PHILIP, (m) => musicOf(m)['on'] === true && musicOf(m)['volume'] === 50);
      await musik(PHILIP, '0');
      await profileOf(lobby, PHILIP, (m) => musicOf(m)['on'] === false && musicOf(m)['volume'] === 0);
      await musik(PHILIP, '80');
      await profileOf(lobby, PHILIP, (m) => musicOf(m)['on'] === true && musicOf(m)['volume'] === 80);
      await musik(PHILIP, 'weiter');
      await profileOf(lobby, PHILIP, (m) => musicOf(m)['skip'] === 1);
      await musik(PHILIP, 'quatsch');
      await said(PHILIP, 'Das kenne ich nicht');
      await musik(PHILIP);
      await said(PHILIP, 'Lautstärke <white>80 %');

      // Lobby-Paket geladen (meldet der Proxy) → im Profil; nur der Proxy darf das melden.
      proxy.send({ t: 'pack', uuid: PHILIP, loaded: true });
      await profileOf(lobby, PHILIP, (m) => musicOf(m)['pack'] === true);
      lobby.send({ t: 'pack', uuid: PHILIP, loaded: false });
      await settle();
      expect(hub.presence.get(PHILIP)).toBeTruthy();

      // Gemerkt über das Verlassen hinaus (das Paket nicht).
      proxy.send({ t: 'leave', uuid: PHILIP });
      await settle();
      await join(PHILIP, 'Philip', 'lobby', 'de_de');
      expect(musicOf(await profileOf(lobby, PHILIP, (m) => musicOf(m)['volume'] === 80))).toMatchObject({
        on: true,
        pack: false,
      });

      // Englisch, und außerhalb der Lobby der Hinweis, dass es dort gilt.
      await join(LENA, 'Lena', 'duels', 'en_us');
      await proxy.request({ t: 'command', uuid: LENA, command: 'music', args: ['off'] });
      await said(LENA, 'The lobby music is off for you');
      await said(LENA, 'applies in the lobby');
    },
    SLOW,
  );
});
