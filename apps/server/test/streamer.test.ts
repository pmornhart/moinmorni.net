import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { streamerHost, streamerHosts } from '@moinmorni/shared';
import { openDatabase } from '../src/db/index.js';
import { createHub, type Hub } from '../src/hub/index.js';
import { coveredText } from '../src/hub/streamer.js';
import { createEventBus } from '../src/lib/events.js';
import { createStores, type Stores } from '../src/panel/stores.js';
import { connectPlugin, type FakePlugin, type Msg } from './fake-plugin.js';

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
const MIA = '33333333-3333-3333-3333-333333333333';

interface Profile {
  readonly streamer: { readonly on: boolean; readonly parts: readonly string[] };
}

describe('Streamer-Modus im Netzwerk', () => {
  let hub: Hub;
  let stores: Stores;
  let url: string;
  const open: FakePlugin[] = [];

  beforeEach(async () => {
    const handle = openDatabase(':memory:');
    const events = createEventBus();
    stores = createStores(handle.db, events);
    hub = createHub({
      secret: SECRET,
      db: handle.db,
      stores,
      events,
      log: quiet,
      timeZone: 'Europe/Berlin',
      domain: 'moinmorni.net',
    });
    const port = await hub.listen('127.0.0.1', 0);
    url = `ws://127.0.0.1:${port}/hub`;
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

  /** Proxy, Lobby und MorniCraft; Philip (Owner) und Lena in der Lobby, Mia (Media) in MorniCraft. */
  const network = async (): Promise<{ proxy: FakePlugin; lobby: FakePlugin; mc: FakePlugin }> => {
    const proxy = await plugin('proxy', 'proxy');
    const lobby = await plugin('lobby', 'backend');
    const mc = await plugin('mornicraft', 'backend');
    hub.players.seen({ uuid: PHILIP, name: 'Philip', bedrock: false });
    hub.players.setRole(PHILIP, 'owner');
    hub.players.seen({ uuid: MIA, name: 'Mia', bedrock: false });
    hub.players.setRole(MIA, 'media');
    const join = async (uuid: string, name: string, server: string): Promise<void> => {
      await proxy.request({ t: 'login', uuid, name, locale: 'de_de', bedrock: false });
      proxy.send({ t: 'switch', uuid, server });
    };
    await join(PHILIP, 'Philip', 'lobby');
    await join(LENA, 'Lena', 'lobby');
    await join(MIA, 'Mia', 'mornicraft');
    await lobby.next('profile', (m) => m['uuid'] === LENA);
    await mc.next('profile', (m) => m['uuid'] === MIA);
    return { proxy, lobby, mc };
  };
  const command = (proxy: FakePlugin, uuid: string, name: string, args: string[] = []): Promise<Msg> =>
    proxy.request({ t: 'command', uuid, command: name, args });
  const said = (proxy: FakePlugin, uuid: string): string =>
    proxy.received
      .filter((m) => m.t === 'msg' && m['uuid'] === uuid)
      .map((m) => String(m['text']))
      .join('\n');

  test('Proxy und Spielserver kennen /streamer und die Adressen zum Verdecken', async () => {
    const { proxy, lobby } = await network();
    const welcome = proxy.received[0] as unknown as { commands: Array<{ name: string; aliases: string[] }> };
    expect(welcome.commands.find((c) => c.name === 'streamer')?.aliases).toContain('streamermodus');
    expect(proxy.received.find((m) => m.t === 'streamer-config')).toMatchObject({ hosts: ['moinmorni.net'] });
    expect(lobby.received.find((m) => m.t === 'streamer-config')).toMatchObject({ hosts: ['moinmorni.net'] });
    // Ohne Streamer-Modus: aus, nichts verdeckt.
    const profile = lobby.received.find((m) => m.t === 'profile' && m['uuid'] === LENA) as unknown as Profile;
    expect(profile.streamer).toEqual({ on: false, parts: [] });
  });

  test('/streamer in der Lobby gilt sofort und auch nach dem Wechsel nach MorniCraft – und umgekehrt', async () => {
    const { proxy, lobby, mc } = await network();
    await command(proxy, LENA, 'streamer', ['an']);
    const on = (await lobby.next(
      'profile',
      (m) => m['uuid'] === LENA && (m as unknown as Profile).streamer.on,
    )) as unknown as Profile;
    expect(on.streamer.parts).toEqual(['ip', 'coords', 'msg', 'live']);
    expect(said(proxy, LENA)).toContain('Streamer-Modus ist an');
    // Menü: Schalter zum Anklicken, Hinweis auf F3.
    expect(said(proxy, LENA)).toContain('click:run_command:"/streamer koordinaten"');
    expect(said(proxy, LENA)).toContain('Reduzierte Debug-Infos');
    // Philip ist auf demselben Server und erfährt, dass Lena streamt.
    expect(said(proxy, PHILIP)).toContain('streamt jetzt');

    // Wechsel nach MorniCraft: dort sofort an (Profil bei der Ankunft).
    proxy.send({ t: 'switch', uuid: LENA, server: 'mornicraft' });
    const there = (await mc.next('profile', (m) => m['uuid'] === LENA)) as unknown as Profile;
    expect(there.streamer).toEqual({ on: true, parts: ['ip', 'coords', 'msg', 'live'] });

    // In MorniCraft einen Teil abschalten (dort geht /streamer an den Hub) – gilt auch zurück in der Lobby.
    await command(proxy, LENA, 'streamer', ['koordinaten']);
    const less = (await mc.next(
      'profile',
      (m) => m['uuid'] === LENA && !(m as unknown as Profile).streamer.parts.includes('coords'),
    )) as unknown as Profile;
    expect(less.streamer.parts).toEqual(['ip', 'msg', 'live']);
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    const back = (await lobby.next(
      'profile',
      (m) => m['uuid'] === LENA && !(m as unknown as Profile).streamer.parts.includes('coords'),
    )) as unknown as Profile;
    expect(back.streamer.on).toBe(true);

    await command(proxy, LENA, 'streamer', ['aus']);
    await lobby.next('profile', (m) => m['uuid'] === LENA && !(m as unknown as Profile).streamer.on);
  });

  test('Chat: Rang, Name, dann ● LIVE; Nachrichten an Streamer mit Verdecken-Zeichen, /msg nur mit der Maus', async () => {
    const { proxy, lobby } = await network();
    await command(proxy, LENA, 'streamer', ['an']);
    lobby.send({ t: 'chat', uuid: LENA, text: 'Hallo Stream' });
    const line = (await lobby.next('chat', (m) => JSON.stringify(m).includes('Hallo Stream'))) as unknown as {
      text: { de: string };
    };
    expect(line.text.de).toContain(' <red>● LIVE</red>');
    // Wie in Tab-Liste und über dem Kopf: Rang bzw. Abzeichen vorn, Name, „● LIVE“ hinten.
    expect(line.text.de.indexOf('LIVE')).toBeGreaterThan(line.text.de.indexOf('Lena'));
    expect(line.text.de.indexOf('LIVE')).toBeLessThan(line.text.de.indexOf('»'));
    lobby.send({ t: 'chat', uuid: PHILIP, text: 'Ohne live' });
    const plain = (await lobby.next('chat', (m) => JSON.stringify(m).includes('Ohne live'))) as unknown as {
      text: { de: string };
    };
    expect(plain.text.de).not.toContain('LIVE');

    // Philip schreibt Lena privat: Text nur beim Drüberfahren, alles an Lena trägt das Verdecken-Zeichen.
    await command(proxy, PHILIP, 'msg', ['Lena', 'komm auf 85.215.54.143']);
    const toLena = await proxy.next('msg', (m) => m['uuid'] === LENA && String(m['text']).includes('Philip'));
    expect(toLena['mask']).toBe(true);
    expect(String(toLena['text'])).toContain('versteckt – Maus drauf zum Lesen');
    expect(String(toLena['text'])).toContain('<hover:show_text:"<white>komm auf 85.215.54.143</white>">');
    // Lena antwortet: Philip streamt nicht, er liest es direkt und ohne Zeichen.
    await command(proxy, LENA, 'r', ['gleich']);
    const toPhilip = await proxy.next(
      'msg',
      (m) => m['uuid'] === PHILIP && String(m['text']).includes('gleich'),
    );
    expect(toPhilip['mask']).toBeUndefined();
    expect(String(toPhilip['text'])).not.toContain('hover');
  });

  test('Panel: nur mit Recht, ein Teil aus, eigene Adressen – sofort überall', async () => {
    const { proxy, lobby, mc } = await network();
    await command(proxy, LENA, 'streamer', ['an']);
    await lobby.next('profile', (m) => m['uuid'] === LENA && (m as unknown as Profile).streamer.on);
    // Nur mit dem Recht „Streamer-Modus“: Lena (Spielerin) ist sofort aus, Mia (Media) darf.
    stores.patchSettings(
      'network',
      { streamerAccess: 'right', streamerLive: false, streamerAddresses: ['https://Play.Example.de/x'] },
      'test',
    );
    await lobby.next('profile', (m) => m['uuid'] === LENA && !(m as unknown as Profile).streamer.on);
    const hosts = ['moinmorni.net', 'play.example.de'];
    await mc.next('streamer-config', (m) => JSON.stringify(m['hosts']) === JSON.stringify(hosts));
    await command(proxy, LENA, 'streamer', ['an']);
    expect(said(proxy, LENA)).toContain('darf dein Rang nicht');
    await command(proxy, MIA, 'streamer', ['an']);
    const mia = (await mc.next(
      'profile',
      (m) => m['uuid'] === MIA && (m as unknown as Profile).streamer.on,
    )) as unknown as Profile;
    // ● LIVE ist im Panel aus: gibt es für niemanden, auch nicht im Menü.
    expect(mia.streamer.parts).toEqual(['ip', 'coords', 'msg']);
    expect(said(proxy, MIA)).not.toContain('/streamer live');
    // Ganz aus: auch Mia ist aus; ausschalten geht trotzdem immer.
    stores.patchSettings('network', { streamerAccess: 'off' }, 'test');
    await mc.next('profile', (m) => m['uuid'] === MIA && !(m as unknown as Profile).streamer.on);
    await command(proxy, MIA, 'streamer', ['aus']);
    expect(said(proxy, MIA)).toContain('Streamer-Modus ist aus');
  });

  test('Einstellungen per Spielbefehl wie im Panel', async () => {
    const { proxy } = await network();
    await command(proxy, PHILIP, 'netzwerk', ['streamer', 'recht']);
    expect(stores.settings('network')['streamerAccess']).toBe('right');
    await command(proxy, PHILIP, 'netzwerk', ['streamer', 'domain', 'aus']);
    expect(stores.settings('network')['streamerHideDomain']).toBe(false);
    await command(proxy, PHILIP, 'netzwerk', ['streamer', 'adresse', 'hinzu', 'mc.example.de']);
    expect(stores.settings('network')['streamerAddresses']).toEqual(['mc.example.de']);
    await proxy.next('streamer-config', (m) => JSON.stringify(m['hosts']) === '["mc.example.de"]');
    // Spieler dürfen das nicht.
    await command(proxy, LENA, 'netzwerk', ['streamer', 'alle']);
    expect(stores.settings('network')['streamerAccess']).toBe('right');
  });

  test('Einzelteile: Adressen aus dem Panel, verdeckter Text sicher eingesetzt', () => {
    expect(streamerHost('https://Play.Example.de:25565/hilfe')).toBe('play.example.de');
    expect(streamerHost('85.215.54.143')).toBe('85.215.54.143');
    expect(streamerHost('kein name!')).toBeNull();
    expect(
      streamerHosts({ streamerHideDomain: false, streamerAddresses: ['a.de', 'A.de', ' '] }, 'x.net'),
    ).toEqual(['a.de']);
    // Wer im Text Zeichen von MiniMessage schreibt, kommt nicht aus dem Mauszeiger-Text heraus.
    expect(coveredText('de', 'a\\b "x" <red><click:run_command:"/op">')).toBe(
      '<hover:show_text:"<white>a\\\\\\\\b \\"x\\" \\\\<red>\\\\<click:run_command:\\"/op\\"></white>"><italic>versteckt – Maus drauf zum Lesen</italic></hover>',
    );
  });
});
