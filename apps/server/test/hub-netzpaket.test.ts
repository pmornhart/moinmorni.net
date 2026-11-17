import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { badgePackOf } from '../src/badges/pack.js';
import { openDatabase } from '../src/db/index.js';
import { createHub, type Hub } from '../src/hub/index.js';
import { createEventBus } from '../src/lib/events.js';
import { createStores, type Stores } from '../src/panel/stores.js';
import { mergePackRequired } from '../src/panel/pack-required.js';
import { settingValues } from '../src/db/schema.js';
import { connectPlugin, type FakePlugin } from './fake-plugin.js';

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
const SHA1 = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';
const NETZ_URL = `https://moinmorni.test/api/public/packs/netz.zip?v=${SHA1}`;

describe('Hub: Netzwerk-Paket (ein Paket, einmal laden)', () => {
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
      netzPack: () => ({ url: NETZ_URL, sha1: SHA1 }),
      badgePack: () => {
        const pack = badgePackOf(stores.roles());
        return { url: `https://moinmorni.test/a.zip?v=${pack.sha1}`, sha1: pack.sha1 };
      },
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
  const network = async (): Promise<{ proxy: FakePlugin; lobby: FakePlugin }> => {
    const proxy = await plugin('proxy', 'proxy');
    const lobby = await plugin('lobby', 'backend');
    hub.players.seen({ uuid: PHILIP, name: 'Philip', bedrock: false });
    hub.players.setRole(PHILIP, 'owner');
    await proxy.request({ t: 'login', uuid: PHILIP, name: 'Philip', locale: 'de_de', bedrock: false });
    proxy.send({ t: 'switch', uuid: PHILIP, server: 'lobby' });
    await proxy.request({ t: 'login', uuid: LENA, name: 'Lena', locale: 'en_us', bedrock: false });
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    await lobby.next('profile', (m) => m['uuid'] === LENA);
    return { proxy, lobby };
  };

  test('Proxy erfährt beim Verbinden Adresse und SHA-1, Pflicht aus, Text im Fenster je Sprache', async () => {
    const { proxy } = await network();
    const m = await proxy.next('netzpaket');
    expect(m).toMatchObject({ enabled: true, url: NETZ_URL, sha1: SHA1, required: false });
    expect((m['prompt'] as Record<string, string>)['de']).toContain('einmal laden');
  });

  test('geladen → Profil trägt pack (für Angelkönig und die Lobbymusik); nur der Proxy darf das melden', async () => {
    const { proxy, lobby } = await network();
    lobby.send({ t: 'pack', uuid: LENA, loaded: true, status: 'loaded' });
    await new Promise((r) => setTimeout(r, 150));
    proxy.send({ t: 'pack', uuid: LENA, loaded: true, status: 'loaded' });
    const profile = await lobby.next('profile', (m) => m['uuid'] === LENA && m['pack'] === true);
    expect((profile['music'] as Record<string, unknown>)['pack']).toBe(true);
  });

  test('/paket schickt das Paket noch einmal; ein Schalter „Pflicht“ für beide Pakete; abgelehnt → hinaus', async () => {
    const { proxy } = await network();
    await proxy.request({ t: 'command', uuid: LENA, command: 'paket', args: [] });
    await proxy.next('netzpaket-send', (m) => m['uuid'] === LENA);
    // Ohne Pflicht: Hinweis, kein Rauswurf
    proxy.send({ t: 'pack', uuid: LENA, loaded: false, status: 'declined' });
    await proxy.next('msg', (m) => m['uuid'] === LENA && String(m['text']).includes('/pack'));
    // Pflicht im Spiel an (Owner) – beide Pakete sagen es im Fenster
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'netzwerk', args: ['paket', 'an'] });
    await proxy.next('netzpaket', (m) => m['required'] === true);
    await proxy.next('badges', (m) => m['required'] === true);
    proxy.send({ t: 'pack', uuid: LENA, loaded: false, status: 'declined' });
    const kick = await proxy.next('kick', (m) => m['uuid'] === LENA);
    expect(kick['text']).toContain('Server Resource Packs: Enabled');
  });

  test('alter Schalter „Möbel-Paket verpflichtend“ an → neuer Schalter einmal an', () => {
    const handle = openDatabase(':memory:');
    const at = new Date().toISOString();
    handle.db
      .insert(settingValues)
      .values({ area: 'lobby', key: 'packRequired', value: true, updatedBy: 'x', updatedAt: at })
      .run();
    const s = createStores(handle.db, createEventBus());
    expect(s.settings('network')['packRequired']).toBe(true);
    // Danach bleibt, was im Panel steht.
    s.patchSettings('network', { packRequired: false }, 'x');
    expect(mergePackRequired(handle.db)).toBe(false);
    expect(s.settings('network')['packRequired']).toBe(false);
  });
});
