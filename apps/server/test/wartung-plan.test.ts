import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { countdownWords, parseCountdown } from '@moinmorni/shared';
import { openDatabase } from '../src/db/index.js';
import { createHub, type Hub } from '../src/hub/index.js';
import { parseAnnounce } from '../src/hub/wartung-plan.js';
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
const FINN = '33333333-3333-3333-3333-333333333333';
const SECOND_MS = 1000;
/** Der Wartungs-Neustart wartet kurz, bis alle in der Wartungs-Lobby sind. */
const SETTLE_WAIT_MS = 3500;
const S30 = 30;
const S600 = 600;
const S5400 = 5400;
const S90 = 90;
const S3660 = 3660;
const SHORT_MS = 50;
const S540 = 540;
const S240 = 240;
const S300 = 300;
const S60 = 60;
const DONE = 2;
const TOTAL = 5;
const SLOW_TEST_MS = 15_000;
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('Zeit und Grund für /wartung', () => {
  test('Zeiten', () => {
    expect(parseCountdown('30s')).toBe(S30);
    expect(parseCountdown('10min')).toBe(S600);
    expect(parseCountdown('10m')).toBe(S600);
    expect(parseCountdown('1h30m')).toBe(S5400);
    expect(parseCountdown('90')).toBe(S90);
    expect(parseCountdown('sofort')).toBe(0);
    expect(parseCountdown('7h')).toBeNull();
    expect(parseCountdown('Update')).toBeNull();
    expect(countdownWords(S3660, 'de')).toBe('1 Stunde 1 Minute');
    expect(countdownWords(S30, 'en')).toBe('30 seconds');
  });
  test('Zeit, Grund und --proxy', () => {
    expect(parseAnnounce(['10min', 'Großes', 'Update'])).toEqual({
      seconds: S600,
      reason: 'Großes Update',
      proxy: false,
    });
    expect(parseAnnounce(['Update', '--proxy'])).toEqual({ seconds: 0, reason: 'Update', proxy: true });
    expect(parseAnnounce(['10x', 'Update'])).toBe('bad_time');
    expect(parseAnnounce([])).toEqual({ seconds: 0, reason: '', proxy: false });
  });
});

describe('Wartung ankündigen und Wartungs-Neustart', () => {
  let hub: Hub;
  let stores: Stores;
  let url: string;
  let clock: { now: number };
  const open: FakePlugin[] = [];

  beforeEach(async () => {
    const handle = openDatabase(':memory:');
    const events = createEventBus();
    stores = createStores(handle.db, events);
    clock = { now: Date.parse('2026-11-17T20:00:00Z') };
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
  const join = async (proxy: FakePlugin, uuid: string, name: string, server = 'lobby'): Promise<void> => {
    await proxy.request({ t: 'login', uuid, name, locale: 'de_de', bedrock: false });
    proxy.send({ t: 'switch', uuid, server });
    await pause(SHORT_MS);
  };
  const command = (proxy: FakePlugin, uuid: string, name: string, args: string[]): Promise<Msg> =>
    proxy.request({ t: 'command', uuid, command: name, args });
  const to = (proxy: FakePlugin, t: string, uuid: string): Msg[] =>
    proxy.received.filter((m) => m.t === t && m['uuid'] === uuid);
  const later = async (seconds: number): Promise<void> => {
    clock.now += seconds * SECOND_MS;
    hub.wartungPlan.tick();
    await pause(SHORT_MS);
  };

  test('/wartung an 10min Update: Titel, Chat und Leiste für alle (auch Neue), dann Wartung an', async () => {
    const proxy = await plugin('proxy', 'proxy');
    await plugin('lobby', 'backend');
    await plugin('wartung', 'backend');
    await join(proxy, PHILIP, 'Philip');
    await join(proxy, LENA, 'Lena');
    // Lena darf es nicht.
    await command(proxy, LENA, 'wartung', ['an', '10min', 'Update']);
    expect(hub.wartungPlan.view().plan).toBeNull();
    expect(to(proxy, 'msg', LENA).some((m) => String(m['text']).includes('nur, wer im Panel'))).toBe(true);

    await command(proxy, PHILIP, 'wartung', ['an', '10min', 'Großes', 'Update']);
    expect(hub.wartungPlan.view().plan).toMatchObject({ kind: 'on', seconds: S600, reason: 'Großes Update' });
    const title = to(proxy, 'title', LENA)[0];
    expect(String(title?.['title'])).toContain('Wartung');
    expect(String(title?.['subtitle'])).toContain('10 Minuten');
    expect(String(title?.['subtitle'])).toContain('Großes Update');
    const bar = to(proxy, 'countdown', LENA)[0];
    expect(bar?.['seconds']).toBe(S600);
    expect(String(bar?.['text'])).toContain('{t}');
    expect(to(proxy, 'msg', LENA).some((m) => String(m['text']).includes('Wartung in 10 Minuten'))).toBe(
      true,
    );

    // Wer während des Countdowns kommt, sieht ihn auch.
    await later(S60);
    await join(proxy, FINN, 'Finn');
    expect(to(proxy, 'countdown', FINN)[0]?.['seconds']).toBe(S540);
    // Erinnerung bei 5 Minuten.
    await later(S240);
    expect(to(proxy, 'title', LENA).some((m) => String(m['subtitle']).includes('5 Minuten'))).toBe(true);
    expect(stores.settings('network')['maintenance']).toBe(false);

    await later(S300);
    expect(stores.settings('network')['maintenance']).toBe(true);
    expect(stores.settings('network')['maintenanceMessage']).toBe('Großes Update');
    expect(hub.wartungPlan.view().plan).toBeNull();
    // Lena (ohne „Kommt immer rein“) kommt in die Wartungs-Lobby.
    await pause(SHORT_MS);
    expect(to(proxy, 'connect', LENA).some((m) => m['server'] === 'wartung')).toBe(true);

    await command(proxy, PHILIP, 'wartung', ['aus']);
    expect(stores.settings('network')['maintenance']).toBe(false);
  });

  test('Abbrechen: Titel „abgesagt“, Leiste weg, keine Wartung; /maintenance on ohne Zeit sofort', async () => {
    const proxy = await plugin('proxy', 'proxy');
    await plugin('lobby', 'backend');
    await join(proxy, PHILIP, 'Philip');
    await join(proxy, LENA, 'Lena');
    await command(proxy, PHILIP, 'wartung', ['an', '5m']);
    await command(proxy, PHILIP, 'wartung', ['abbrechen']);
    expect(hub.wartungPlan.view().plan).toBeNull();
    expect(to(proxy, 'title', LENA).some((m) => String(m['title']).includes('abgesagt'))).toBe(true);
    expect(to(proxy, 'countdown', LENA).at(-1)?.['seconds']).toBe(1);
    await later(S600);
    expect(stores.settings('network')['maintenance']).toBe(false);

    await command(proxy, PHILIP, 'maintenance', ['on', 'Kurz', 'umbauen']);
    expect(stores.settings('network')['maintenance']).toBe(true);
    expect(stores.settings('network')['maintenanceMessage']).toBe('Kurz umbauen');
    // Einstellungen aus dem Katalog gehen weiter, auch englisch.
    await command(proxy, PHILIP, 'maintenance', ['until', '22:30']);
    expect(stores.settings('network')['maintenanceUntil']).toBe('22:30');
  });

  test(
    'Wartungs-Neustart: alle (auch das Team) in die Wartungs-Lobby, alles neu, danach Wartung aus',
    async () => {
      const proxy = await plugin('proxy', 'proxy');
      await plugin('lobby', 'backend');
      await plugin('wartung', 'backend');
      await join(proxy, PHILIP, 'Philip');
      await join(proxy, LENA, 'Lena', 'duels');
      // Ohne MoinMorni dahinter geht kein Neustart.
      await command(proxy, PHILIP, 'wartung', ['neustart', '30s']);
      expect(hub.wartungPlan.view().plan).toBeNull();

      const runs: boolean[] = [];
      const release: { done: () => void } = { done: () => undefined };
      hub.wartungPlan.attach({
        restarter: {
          run: (proxyToo) => {
            runs.push(proxyToo);
            return new Promise((resolve) => {
              release.done = resolve;
            });
          },
          progress: () => ({ done: DONE, total: TOTAL }),
        },
      });
      await command(proxy, PHILIP, 'wartung-restart', ['30s', 'Update']);
      expect(hub.wartungPlan.view().plan).toMatchObject({ kind: 'restart', phase: 'announce', proxy: false });
      await later(S30);
      expect(stores.settings('network')['maintenance']).toBe(true);
      await pause(SHORT_MS);
      // Auch der Owner muss in die Wartungs-Lobby – alles außer ihr startet gleich neu.
      expect(to(proxy, 'connect', PHILIP).some((m) => m['server'] === 'wartung')).toBe(true);
      expect(to(proxy, 'connect', LENA).some((m) => m['server'] === 'wartung')).toBe(true);
      await pause(SETTLE_WAIT_MS);
      expect(runs).toEqual([false]);
      await later(1);
      expect(hub.wartungPlan.view().plan).toMatchObject({
        phase: 'restarting',
        progress: { done: DONE, total: TOTAL },
      });
      // Während des Neustarts lässt sich die Wartung nicht ausschalten.
      await command(proxy, PHILIP, 'wartung', ['aus']);
      expect(stores.settings('network')['maintenance']).toBe(true);

      release.done();
      await hub.wartungPlan.settled();
      await pause(SHORT_MS);
      expect(stores.settings('network')['maintenance']).toBe(false);
      expect(hub.wartungPlan.view().plan).toBeNull();
      expect(to(proxy, 'title', LENA).some((m) => String(m['title']).includes('Fertig'))).toBe(true);
    },
    SLOW_TEST_MS,
  );

  test(
    'War die Wartung schon an, bleibt sie nach dem Neustart an; --proxy startet auch den Proxy',
    async () => {
      const proxy = await plugin('proxy', 'proxy');
      await plugin('lobby', 'backend');
      await plugin('wartung', 'backend');
      await join(proxy, PHILIP, 'Philip');
      const runs: boolean[] = [];
      hub.wartungPlan.attach({
        restarter: {
          run: (proxyToo) => {
            runs.push(proxyToo);
            return Promise.resolve();
          },
          progress: () => ({ done: 0, total: 0 }),
        },
      });
      await command(proxy, PHILIP, 'wartung', ['an']);
      await command(proxy, PHILIP, 'wartung', ['neustart', 'sofort', '--proxy']);
      await pause(SETTLE_WAIT_MS);
      await hub.wartungPlan.settled();
      expect(runs).toEqual([true]);
      expect(stores.settings('network')['maintenance']).toBe(true);
    },
    SLOW_TEST_MS,
  );
});
