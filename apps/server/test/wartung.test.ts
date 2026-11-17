import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { WARTUNG_GENERATOR, WARTUNG_NAMESPACE, WARTUNG_POINTS, wartungPack } from '@moinmorni/builder';
import { SERVER_MAX_PLAYERS, WARTUNG_RETURN_SECONDS } from '@moinmorni/shared';
import { openDatabase } from '../src/db/index.js';
import { createHub, type Hub } from '../src/hub/index.js';
import { createEventBus } from '../src/lib/events.js';
import { createWartungWorld, wartungProperties } from '../src/lobby/wartung.js';
import type { MotorClient } from '../src/motor/client.js';
import { createProvisioner } from '../src/network/provision.js';
import { createStores, type Stores } from '../src/panel/stores.js';
import { connectPlugin, type FakePlugin, type Msg } from './fake-plugin.js';
import { createHarness, type Harness } from './harness.js';

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
const FINN = '33333333-3333-3333-3333-333333333333';
/** Etwas länger als ein Takt der Wartungs-Lobby (jede Sekunde). */
const TICK_WAIT_MS = 1300;
const SECOND_MS = 1000;

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('Wartungs-Lobby im Hub', () => {
  let hub: Hub;
  let stores: Stores;
  let url: string;
  let clock: { now: number };
  const open: FakePlugin[] = [];

  beforeEach(async () => {
    const handle = openDatabase(':memory:');
    const events = createEventBus();
    stores = createStores(handle.db, events);
    clock = { now: Date.parse('2026-11-16T20:00:00Z') };
    hub = createHub({
      secret: SECRET,
      db: handle.db,
      stores,
      events,
      log: quiet,
      timeZone: 'Europe/Berlin',
      now: () => clock.now,
    });
    const port = await hub.listen('127.0.0.1', 0);
    url = `ws://127.0.0.1:${port}/hub`;
    hub.players.seen({ uuid: PHILIP, name: 'Philip', bedrock: false });
    hub.players.setRole(PHILIP, 'owner');
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
  const login = (proxy: FakePlugin, uuid: string, name: string, locale = 'de_de'): Promise<Msg> =>
    proxy.request({ t: 'login', uuid, name, locale, bedrock: false });
  const data = (m: Msg): Record<string, unknown> => m['data'] as Record<string, unknown>;

  test('Lobby weg: Ankunft und Rauswurf nur in die Wartungs-Lobby – nie Bau-Server oder Modi', async () => {
    const proxy = await plugin('proxy', 'proxy');
    await plugin('wartung', 'backend');
    await plugin('bau', 'backend');
    await plugin('duels', 'backend');
    const lena = await login(proxy, LENA, 'Lena');
    expect(data(lena)).toMatchObject({ allow: true, server: 'wartung' });

    const kicked = await proxy.request({ t: 'fallback', uuid: LENA, from: 'duels', tried: ['duels'] });
    expect(data(kicked)['order']).toEqual(['wartung', 'lobby']);
    expect(String(data(kicked)['bye'])).toContain('Lobby startet gerade neu');

    // Lobby wieder da: sie zuerst, die Wartungs-Lobby als zweite Wahl.
    await plugin('lobby', 'backend');
    const later = await proxy.request({ t: 'fallback', uuid: LENA, from: 'duels', tried: ['duels'] });
    expect(data(later)['order']).toEqual(['lobby', 'wartung']);
    expect(data(await login(proxy, FINN, 'Finn'))).toMatchObject({ server: 'lobby' });
  });

  test('Lobby ging beim Proxy nicht (hängt, Plugin noch am Hub): erst die Wartungs-Lobby, bis sie neu verbindet', async () => {
    const proxy = await plugin('proxy', 'proxy');
    await plugin('wartung', 'backend');
    const lobby = await plugin('lobby', 'backend');
    expect(data(await login(proxy, LENA, 'Lena'))).toMatchObject({ server: 'lobby' });
    const failed = await proxy.request({ t: 'fallback', uuid: LENA, from: 'lobby', tried: ['lobby'] });
    expect(data(failed)['order']).toEqual(['wartung', 'lobby']);
    // Für die Nächsten auch – und kein Countdown zurück in eine Lobby, die gerade nicht ging.
    expect(data(await login(proxy, FINN, 'Finn'))).toMatchObject({ server: 'wartung' });
    lobby.close();
    await plugin('lobby', 'backend');
    await pause(100);
    const later = await proxy.request({ t: 'fallback', uuid: LENA, from: 'duels', tried: ['duels'] });
    expect(data(later)['order']).toEqual(['lobby', 'wartung']);
  });

  test('Lobby kommt zurück: Countdown in der Wartungs-Lobby, dann alle zurück; wer freiwillig da ist, bleibt', async () => {
    const proxy = await plugin('proxy', 'proxy');
    const wartung = await plugin('wartung', 'backend');
    await login(proxy, LENA, 'Lena');
    proxy.send({ t: 'switch', uuid: LENA, server: 'wartung' });
    // Philip geht selbst hin (z. B. zum Anschauen) – er bleibt, wenn die Lobby wieder da ist.
    await login(proxy, PHILIP, 'Philip');
    proxy.send({ t: 'switch', uuid: PHILIP, server: 'bau' });
    expect(data(await proxy.request({ t: 'connecting', uuid: PHILIP, server: 'wartung' }))).toMatchObject({
      allow: true,
    });
    proxy.send({ t: 'switch', uuid: PHILIP, server: 'wartung' });
    await wartung.next('profile', (m) => m['uuid'] === LENA);

    await plugin('lobby', 'backend');
    const countdown = await wartung.next('wartung', (m) => m['returnIn'] === WARTUNG_RETURN_SECONDS);
    expect(countdown).toMatchObject({ lobby: true, maintenance: false });
    expect(countdown['points']).toEqual(JSON.parse(JSON.stringify(WARTUNG_POINTS)));

    clock.now += WARTUNG_RETURN_SECONDS * SECOND_MS;
    const back = await proxy.next('connect', (m) => m['uuid'] === LENA);
    expect(back['server']).toBe('lobby');
    await pause(TICK_WAIT_MS);
    expect(proxy.received.some((m) => m.t === 'connect' && m['uuid'] === PHILIP)).toBe(false);
  });

  test('Lobby startet nach einem Update neu: ihre Spieler warten in der Wartungs-Lobby, danach von selbst zurück', async () => {
    const proxy = await plugin('proxy', 'proxy');
    const wartung = await plugin('wartung', 'backend');
    const lobby = await plugin('lobby', 'backend');
    await login(proxy, LENA, 'Lena');
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    await lobby.next('profile', (m) => m['uuid'] === LENA);
    expect(hub.wartung.open()).toBe(true);
    expect(hub.wartung.parked(LENA)).toBe(false);

    expect(hub.wartung.park(LENA)).toBe(true);
    expect((await proxy.next('connect', (m) => m['uuid'] === LENA))['server']).toBe('wartung');
    proxy.send({ t: 'switch', uuid: LENA, server: 'wartung' });
    await wartung.next('profile', (m) => m['uuid'] === LENA);
    // Der Neustart nach einem Update wartet darauf, bevor er die Wartungs-Lobby neu startet.
    expect(hub.wartung.returning()).toBe(1);
    // Die Lobby hängt noch kurz am Hub – kein Countdown zurück, bevor sie neu gestartet ist.
    await pause(TICK_WAIT_MS);
    expect(wartung.received.some((m) => m.t === 'wartung' && typeof m['returnIn'] === 'number')).toBe(false);
    expect(proxy.received.filter((m) => m.t === 'connect' && m['uuid'] === LENA)).toHaveLength(1);

    // Neu gestartet: wieder am Hub → Countdown → zurück in die Lobby.
    lobby.close();
    const lobby2 = await plugin('lobby', 'backend');
    await wartung.next('wartung', (m) => m['returnIn'] === WARTUNG_RETURN_SECONDS);
    clock.now += WARTUNG_RETURN_SECONDS * SECOND_MS;
    const back = await proxy.next('connect', (m) => m['uuid'] === LENA && m['server'] === 'lobby');
    expect(back['server']).toBe('lobby');
    expect(hub.wartung.returning()).toBe(1); // unterwegs, bis der Proxy den Wechsel meldet
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    await lobby2.next('profile', (m) => m['uuid'] === LENA);
    expect(hub.wartung.returning()).toBe(0);

    // Wartungs-Lobby ausgeschaltet: niemand wird dorthin geschickt.
    stores.patchSettings('network', { maintenanceLobby: false }, 'test');
    expect(hub.wartung.open()).toBe(false);
    expect(hub.wartung.park(LENA)).toBe(false);
  });

  test('Wartung an: Spieler in die Wartungs-Lobby (mit Grund und Uhrzeit), Team bleibt; aus → zurück', async () => {
    const proxy = await plugin('proxy', 'proxy');
    const wartung = await plugin('wartung', 'backend');
    await plugin('lobby', 'backend');
    await plugin('duels', 'backend');
    await login(proxy, LENA, 'Lena');
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    await login(proxy, PHILIP, 'Philip');
    proxy.send({ t: 'switch', uuid: PHILIP, server: 'lobby' });
    await pause(100);

    stores.patchSettings(
      'network',
      { maintenance: true, maintenanceMessage: 'Großes Update', maintenanceUntil: '22.30' },
      'test',
    );
    const moved = await proxy.next('connect', (m) => m['uuid'] === LENA);
    expect(moved['server']).toBe('wartung');
    expect(
      proxy.received.some((m) => m.t === 'msg' && m['uuid'] === LENA && String(m['text']).includes('22:30')),
    ).toBe(true);
    expect(proxy.received.some((m) => m.t === 'connect' && m['uuid'] === PHILIP)).toBe(false);
    const network = await proxy.next('network', (m) => m['maintenance'] === true);
    expect(String(network['motd2'])).toContain('bis ca. 22:30');
    const state = await wartung.next('wartung', (m) => m['maintenance'] === true);
    expect(state).toMatchObject({ message: 'Großes Update', until: '22:30' });

    // In der Wartungs-Lobby: neue Spieler kommen dorthin, Lobby und Modi bleiben zu (auch /lobby).
    proxy.send({ t: 'switch', uuid: LENA, server: 'wartung' });
    expect(data(await login(proxy, FINN, 'Finn'))).toMatchObject({ allow: true, server: 'wartung' });
    expect(data(await proxy.request({ t: 'connecting', uuid: LENA, server: 'duels' }))).toMatchObject({
      allow: false,
      redirect: 'wartung',
    });
    await proxy.request({ t: 'command', uuid: LENA, command: 'lobby', args: [] });
    await proxy.next('msg', (m) => m['uuid'] === LENA && String(m['text']).includes('Wartung läuft'));
    const parked = await proxy.request({ t: 'fallback', uuid: LENA, from: 'wartung', tried: ['wartung'] });
    expect(data(parked)['order']).toEqual(['wartung']);
    // Das Team kommt überall hin.
    expect(data(await proxy.request({ t: 'connecting', uuid: PHILIP, server: 'duels' }))).toMatchObject({
      allow: true,
    });

    stores.patchSettings('network', { maintenance: false }, 'test');
    await wartung.next(
      'wartung',
      (m) => m['maintenance'] === false && m['returnIn'] === WARTUNG_RETURN_SECONDS,
    );
    clock.now += WARTUNG_RETURN_SECONDS * SECOND_MS;
    expect((await proxy.next('connect', (m) => m['uuid'] === LENA))['server']).toBe('lobby');
  });

  test('Ohne automatisch zurück: Hinweis auf /lobby; Wartungs-Lobby aus: bei Wartung abweisen wie früher', async () => {
    const proxy = await plugin('proxy', 'proxy');
    await plugin('wartung', 'backend');
    stores.patchSettings('network', { maintenanceReturn: false }, 'test');
    await login(proxy, LENA, 'Lena', 'en_us');
    proxy.send({ t: 'switch', uuid: LENA, server: 'wartung' });
    await plugin('lobby', 'backend');
    await proxy.next('msg', (m) => m['uuid'] === LENA && String(m['text']).includes('/lobby'));
    await pause(TICK_WAIT_MS);
    expect(proxy.received.some((m) => m.t === 'connect' && m['uuid'] === LENA)).toBe(false);

    stores.patchSettings(
      'network',
      { maintenance: true, maintenanceLobby: false, maintenanceUntil: '23:00' },
      'test',
    );
    const finn = await login(proxy, FINN, 'Finn');
    expect(data(finn)['allow']).toBe(false);
    expect(String(data(finn)['message'])).toContain('bis ca. <white>23:00');
  });

  test('Einstellungen per Befehl: /wartung bis, /wartung lobby, /wartung zurueck', async () => {
    const proxy = await plugin('proxy', 'proxy');
    await login(proxy, PHILIP, 'Philip');
    const cmd = (...args: string[]) =>
      proxy.request({ t: 'command', uuid: PHILIP, command: 'wartung', args });
    await cmd('bis', '7.05');
    expect(stores.settings('network')['maintenanceUntil']).toBe('7.05');
    await cmd('bis', '25:00');
    await proxy.next('msg', (m) => String(m['text']).includes('passt nicht'));
    expect(stores.settings('network')['maintenanceUntil']).toBe('7.05');
    await cmd('bis', 'weg');
    expect(stores.settings('network')['maintenanceUntil']).toBe('');
    await cmd('lobby', 'aus');
    expect(stores.settings('network')['maintenanceLobby']).toBe(false);
    await cmd('zurueck', 'aus');
    expect(stores.settings('network')['maintenanceReturn']).toBe(false);
  });
});

describe('Wartungs-Lobby im Netzwerk', () => {
  let h: Harness | undefined;
  afterEach(async () => {
    await h?.cleanup();
    h = undefined;
  });

  test('bestehende Installation bekommt die Wartungs-Lobby beim Start dazu, eingestellt und gebaut', async () => {
    h = await createHarness();
    const jar = path.join(h.mmDir, 'MoinMorni-Network.jar');
    fs.writeFileSync(jar, 'plugin');
    const config = { ...h.mm.config, pluginFile: jar };
    const commands: string[] = [];
    const harness = h;
    const motor: MotorClient = {
      ...h.mm.motor,
      request: async <T>(method: string, url: string, body?: unknown): Promise<T> => {
        if (url.endsWith('/command')) commands.push((body as { command: string }).command);
        return harness.mm.motor.request<T>(method, url, body);
      },
    };
    const world = createWartungWorld(motor, quiet, {
      sleep: () => new Promise((r) => setTimeout(r, 5)),
      settleMs: 0,
      gapMs: 0,
      pollMs: 50,
      readyTimeoutMs: 20_000,
      loadTimeoutMs: 2_000,
    });
    const options = {
      proxyAddOns: {},
      lobbyAddOns: {},
      buildContent: false,
      versions: { paper: '1.21.4', velocity: '3.4.0' } as const,
      configureWartung: world.configure,
    };
    const first = await createProvisioner(config, motor, h.mm.hub, quiet, options).ensure();
    // So sah eine Installation von vorher aus: ohne Wartungs-Lobby.
    await motor.request('DELETE', `/api/networks/${first.networkId}/members/${first.wartungServerId}`);
    await motor.request('DELETE', `/api/servers/${first.wartungServerId}`);
    const second = await createProvisioner(config, motor, h.mm.hub, quiet, options).ensure();
    expect(second.created).toEqual(['wartung']);
    const id = second.wartungServerId;
    const props = await motor.request<{ content: string }>(
      'GET',
      `/api/servers/${id}/files/content?path=${encodeURIComponent('server.properties')}`,
    );
    // Minecraft (hier der Motor) schreibt „:“ als „\:“.
    const plain = props.content.replaceAll('\\:', ':');
    expect(plain).toContain('level-type=minecraft:flat');
    expect(plain).toContain(`max-players=${SERVER_MAX_PLAYERS}`);
    expect(plain).toContain(JSON.stringify(WARTUNG_GENERATOR));
    expect(await world.configure(id)).toBe(false);

    expect(await world.build(id)).toBe('built');
    const pack = wartungPack();
    expect(commands).toContain(`minecraft:function ${WARTUNG_NAMESPACE}:prepare`);
    expect(commands).toContain(`minecraft:function ${WARTUNG_NAMESPACE}:part/000`);
    expect(commands).toContain(`minecraft:function ${WARTUNG_NAMESPACE}:finish`);
    // Prüfpunkte innerhalb der gebauten Fläche, keine Saison-Deko.
    expect(commands).toContain('minecraft:execute if loaded 64 64 64');
    expect(commands.some((c) => c.includes('moinmorni_season'))).toBe(false);
    expect(await world.build(id)).toBe('current');
    expect(pack.version).toMatch(/^[0-9a-f]{16}$/);
  });

  test('Bauplan: Aushang auf Deutsch und Englisch, Parcours, nur Blocknamen von 26.x', () => {
    const files = Object.values(wartungPack().files).join('\n');
    expect(files).toContain('Wartungsarbeiten');
    expect(files).toContain('Maintenance – back in a moment!');
    expect(files).toContain('mm_wartung_text');
    expect(files).toContain('light_weighted_pressure_plate');
    expect(files).toContain('heavy_weighted_pressure_plate');
    // 26.x will bei setworldspawn mit Blickrichtung zwei Werte – ohne geht es überall (Fund im echten Server).
    expect(files).toMatch(/\nsetworldspawn -?\d+ \d+ -?\d+\n/);
    expect(files).not.toMatch(/ chain[ [\]]/);
    expect(wartungProperties()['view-distance']).toBe('6');
  });
});
