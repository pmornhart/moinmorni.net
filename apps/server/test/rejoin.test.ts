/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import { createHub, type Hub } from '../src/hub/index.js';
import { createEventBus } from '../src/lib/events.js';
import type { MotorClient } from '../src/motor/client.js';
import { createSleepService } from '../src/network/sleep.js';
import { createStores, type Stores } from '../src/panel/stores.js';
import { connectPlugin, type FakePlugin, type Msg } from './fake-plugin.js';

/**
 * Mitten im Spiel (Schnittstelle Fassung 2): Nachfrage vor /lobby und „Zurück ins Spiel“ nach einem Abbruch –
 * gegen den echten Hub mit nachgebauten Plugins (Proxy, Lobby, Duels, Party).
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
const FINN = '33333333-3333-3333-3333-333333333333';
const SECOND = 1_000;
const SETTLE_MS = 120;
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, SETTLE_MS));

describe('Mitten im Spiel', () => {
  let hub: Hub;
  let stores: Stores;
  let url: string;
  let clock: { now: number };
  const open: FakePlugin[] = [];

  beforeEach(async () => {
    const handle = openDatabase(':memory:');
    const events = createEventBus();
    stores = createStores(handle.db, events);
    clock = { now: Date.parse('2026-11-16T18:00:00Z') };
    hub = createHub({
      secret: SECRET,
      db: handle.db,
      stores,
      events,
      log: quiet,
      timeZone: 'Europe/Berlin',
      now: () => clock.now,
    });
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

  /** Proxy, Lobby und Duels; Philip (Owner) in der Lobby, Lena (englisch) in Duels. */
  const network = async (): Promise<{
    proxy: FakePlugin;
    lobby: FakePlugin;
    duels: FakePlugin;
    join: (uuid: string, name: string, server: string, locale?: string, bedrock?: boolean) => Promise<void>;
  }> => {
    const proxy = await plugin('proxy', 'proxy');
    const lobby = await plugin('lobby', 'backend');
    const duels = await plugin('duels', 'backend');
    const join = async (uuid: string, name: string, server: string, locale = 'de_de', bedrock = false) => {
      await proxy.request({ t: 'login', uuid, name, locale, bedrock });
      proxy.send({ t: 'switch', uuid, server });
      await settle();
    };
    hub.players.seen({ uuid: PHILIP, name: 'Philip', bedrock: false });
    hub.players.setRole(PHILIP, 'owner');
    await join(PHILIP, 'Philip', 'lobby');
    await join(LENA, 'Lena', 'duels', 'en_us');
    return { proxy, lobby, duels, join };
  };

  const said = (proxy: FakePlugin, uuid: string, part: string): Promise<Msg> =>
    proxy.next('msg', (m) => m['uuid'] === uuid && String(m['text']).includes(part));
  const count = (p: FakePlugin, t: string, uuid: string): number =>
    p.received.filter((m) => m.t === t && m['uuid'] === uuid).length;

  test('/lobby mitten im Spiel fragt erst nach: Fenster, Knöpfe im Chat, zweites /lobby, Ja und Nein, Schalter', async () => {
    const { proxy, lobby, duels, join } = await network();
    const lobbyCmd = (uuid: string, ...args: string[]) =>
      proxy.request({ t: 'command', uuid, command: 'lobby', args });
    const toLobby = (uuid: string) =>
      proxy.next('connect', (m) => m['uuid'] === uuid && m['server'] === 'lobby');
    const backTo = async (uuid: string, server: string) => {
      proxy.send({ t: 'switch', uuid, server: 'lobby' });
      proxy.send({ t: 'switch', uuid, server });
      await settle();
    };

    // Lena wartet nur (spielt nicht): /lobby geht sofort.
    await lobbyCmd(LENA);
    await toLobby(LENA);
    await said(proxy, LENA, 'Off to the lobby');

    // Sie spielt: /lobby fragt nach – Fenster auf dem Duels-Server, Knöpfe im Chat, keine Verbindung.
    await backTo(LENA, 'duels');
    duels.send({ t: 'playing', uuid: LENA, playing: true });
    await settle();
    const before = count(proxy, 'connect', LENA);
    await lobbyCmd(LENA);
    expect(await duels.next('lobby-ask', (m) => m['uuid'] === LENA)).toMatchObject({ mode: 'Duels' });
    const question = await said(proxy, LENA, 'Really go to the lobby?');
    expect(question['text']).toContain("<click:run_command:'/lobby yes'>");
    expect(question['text']).toContain("<click:run_command:'/lobby no'>");
    await settle();
    expect(count(proxy, 'connect', LENA)).toBe(before);

    // Weiterspielen (Knopf im Chat): Fenster zu, nichts passiert – das nächste /lobby fragt wieder.
    await lobbyCmd(LENA, 'no');
    await duels.next('lobby-ask-close', (m) => m['uuid'] === LENA);
    await said(proxy, LENA, 'have fun playing on');
    await lobbyCmd(LENA);
    await duels.next('lobby-ask', (m) => m['uuid'] === LENA);
    // Ein zweites /lobby innerhalb von 10 Sekunden gilt als Ja.
    clock.now += 5 * SECOND;
    await lobbyCmd(LENA);
    await toLobby(LENA);

    // Später als 10 Sekunden: fragt wieder.
    await backTo(LENA, 'duels');
    duels.send({ t: 'playing', uuid: LENA, playing: true });
    await settle();
    await lobbyCmd(LENA);
    await duels.next('lobby-ask', (m) => m['uuid'] === LENA);
    clock.now += 11 * SECOND;
    await lobbyCmd(LENA);
    await duels.next('lobby-ask', (m) => m['uuid'] === LENA);
    expect(count(proxy, 'connect', LENA)).toBe(before + 1);

    // Antwort im Fenster: Weiterspielen bleibt, Ja geht.
    duels.send({ t: 'lobby-answer', uuid: LENA, yes: false });
    await said(proxy, LENA, 'have fun playing on');
    duels.send({ t: 'lobby-answer', uuid: LENA, yes: true });
    await toLobby(LENA);

    // „Zur Lobby“ im Modus (askToLobby) fragt genauso; /lobby ja (Knopf im Chat) geht gleich.
    await backTo(LENA, 'duels');
    duels.send({ t: 'playing', uuid: LENA, playing: true });
    await settle();
    duels.send({ t: 'ask-lobby', uuid: LENA });
    await duels.next('lobby-ask', (m) => m['uuid'] === LENA);
    await lobbyCmd(LENA, 'ja');
    await toLobby(LENA);

    // Ein anderer Server spricht nicht für Lena (sie ist in Duels).
    await backTo(LENA, 'duels');
    lobby.send({ t: 'playing', uuid: LENA, playing: true });
    lobby.send({ t: 'ask-lobby', uuid: LENA });
    lobby.send({ t: 'lobby-answer', uuid: LENA, yes: true });
    await settle();
    const now = count(proxy, 'connect', LENA);
    await lobbyCmd(LENA);
    await toLobby(LENA);
    expect(count(duels, 'lobby-ask', LENA)).toBe(5);
    expect(count(proxy, 'connect', LENA)).toBe(now + 1);

    // Wechsel vergisst „spielt gerade“: wieder in Duels, ohne neue Meldung → sofort.
    await backTo(LENA, 'duels');
    duels.send({ t: 'playing', uuid: LENA, playing: true });
    await backTo(LENA, 'duels');
    await lobbyCmd(LENA);
    await toLobby(LENA);
    // Ausgeschieden (playing=false) → sofort.
    await backTo(LENA, 'duels');
    duels.send({ t: 'playing', uuid: LENA, playing: true });
    duels.send({ t: 'playing', uuid: LENA, playing: false });
    await settle();
    await lobbyCmd(LENA);
    await toLobby(LENA);

    // Der Modus meldet „spielt“ schon beim Betreten – vor dem Wechsel beim Proxy: zählt, wenn sie wirklich ankommt.
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    await settle();
    duels.send({ t: 'playing', uuid: LENA, playing: true });
    await settle();
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    await settle();
    await lobbyCmd(LENA);
    await duels.next('lobby-ask', (m) => m['uuid'] === LENA);
    // … nicht, wenn sie woanders ankommt oder zu spät.
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    await settle();
    duels.send({ t: 'playing', uuid: LENA, playing: true });
    await settle();
    proxy.send({ t: 'switch', uuid: LENA, server: 'party' });
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    await settle();
    await lobbyCmd(LENA);
    await toLobby(LENA);
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    await settle();
    duels.send({ t: 'playing', uuid: LENA, playing: true });
    await settle();
    clock.now += 6 * SECOND;
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    await settle();
    await lobbyCmd(LENA);
    await toLobby(LENA);

    // Bedrock: Fenster und /lobby statt Knöpfen im Chat (dort kann man nicht klicken).
    await join(FINN, 'Finn', 'duels', 'de_de', true);
    duels.send({ t: 'playing', uuid: FINN, playing: true });
    await settle();
    await lobbyCmd(FINN);
    await duels.next('lobby-ask', (m) => m['uuid'] === FINN);
    const bedrock = await said(proxy, FINN, 'Wähl im Fenster');
    expect(bedrock['text']).not.toContain('<click:');

    // Im Panel aus: /lobby geht sofort, auch mitten im Spiel.
    stores.patchSettings('network', { lobbyConfirm: false }, 'test');
    await lobbyCmd(FINN);
    await toLobby(FINN);
    // Wörter nach /lobby bleiben die Lobby-Einstellungen.
    await lobbyCmd(PHILIP, 'saison', 'wiesn');
    expect(stores.settings('lobby')['season']).toBe('wiesn');
  });

  test('Zurück ins Spiel: Platz frei gehalten, Angebot in der Lobby, Klick bringt genau dorthin', async () => {
    const { proxy, lobby, duels, join } = await network();
    const crash = async (uuid: string, server: string, seconds: number, modeFirst = false) => {
      // Verbindung weg: Proxy und Modus melden sich in beliebiger Reihenfolge.
      if (modeFirst) duels.send({ t: 'hold-slot', uuid, seconds });
      proxy.send({ t: 'leave', uuid });
      if (!modeFirst) (server === 'duels' ? duels : lobby).send({ t: 'hold-slot', uuid, seconds });
      await settle();
    };
    const offerFor = (uuid: string) => lobby.next('rejoin-offer', (m) => m['uuid'] === uuid);
    const offFor = (uuid: string) => lobby.next('rejoin-off', (m) => m['uuid'] === uuid);

    // Lena spielt Duels – die Verbindung reißt ab, Duels hält den Platz zwei Minuten frei.
    duels.send({ t: 'playing', uuid: LENA, playing: true });
    await crash(LENA, 'duels', 120);
    expect(hub.heldServers()).toEqual(['duels']);
    // Sie kommt wieder (landet in der Lobby): Angebot mit Restzeit, Knopf im Chat.
    await join(LENA, 'Lena', 'lobby', 'en_us');
    const offer = await offerFor(LENA);
    expect(offer).toMatchObject({
      server: 'duels',
      mode: { id: 'duels', de: 'Duels', en: 'Duels' },
      seconds: 120,
    });
    expect(String(offer['chat'])).toContain('your spot is still free');
    expect(String(offer['chat'])).toContain("<click:run_command:'/rejoin'>");
    // Klick auf den Gegenstand: genau zurück auf den Duels-Server.
    lobby.send({ t: 'rejoin', uuid: LENA });
    expect(await proxy.next('connect', (m) => m['uuid'] === LENA)).toMatchObject({ server: 'duels' });
    await said(proxy, LENA, 'Back to');
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    await settle();
    expect(hub.heldServers()).toEqual([]);
    // Erledigt: wieder in der Lobby gibt es kein Angebot mehr, /rueckkehr sagt es freundlich.
    const offers = count(lobby, 'rejoin-offer', LENA);
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    await settle();
    expect(count(lobby, 'rejoin-offer', LENA)).toBe(offers);
    await proxy.request({ t: 'command', uuid: LENA, command: 'rueckkehr', args: [] });
    await said(proxy, LENA, 'No round is waiting');

    // Der Modus meldet zuerst (Abmeldung beim Proxy danach) – zählt genauso; /rueckkehr bringt auch zurück.
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    await settle();
    await crash(LENA, 'duels', 60, true);
    await join(LENA, 'Lena', 'lobby', 'en_us');
    await offerFor(LENA);
    await proxy.request({ t: 'command', uuid: LENA, command: 'rueckkehr', args: [] });
    expect(await proxy.next('connect', (m) => m['uuid'] === LENA)).toMatchObject({ server: 'duels' });

    // Der Modus nimmt das Angebot zurück (Runde vorbei): weg, mit kurzem Hinweis.
    await crash(LENA, 'duels', 60);
    await join(LENA, 'Lena', 'lobby', 'en_us');
    await offerFor(LENA);
    duels.send({ t: 'hold-slot', uuid: LENA, seconds: 0 });
    await offFor(LENA);
    await said(proxy, LENA, 'is over by now');
    expect(hub.heldServers()).toEqual([]);

    // Nimmt der Modus den Platz zurück, weil sie gerade zurückkommt (Betreten vor dem Wechsel beim Proxy): kein
    // „Runde vorbei“.
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    await settle();
    await crash(LENA, 'duels', 60);
    await join(LENA, 'Lena', 'lobby', 'en_us');
    await offerFor(LENA);
    duels.send({ t: 'hold-slot', uuid: LENA, seconds: 0 });
    await offFor(LENA);
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    await new Promise((r) => setTimeout(r, 2_000));
    expect(
      proxy.received.filter((m) => m.t === 'msg' && String(m['text']).includes('is over by now')),
    ).toHaveLength(1);

    // Ablauf: nach der Zeit verschwindet das Angebot von selbst.
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    await settle();
    await crash(LENA, 'duels', 30);
    await join(LENA, 'Lena', 'lobby', 'en_us');
    await offerFor(LENA);
    clock.now += 31 * SECOND;
    await offFor(LENA);
    await said(proxy, LENA, "Time's up");

    // Im Panel aus: kein Angebot (und weg, falls eins da war); wieder an: kommt wieder.
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    await settle();
    await crash(LENA, 'duels', 300);
    await join(LENA, 'Lena', 'lobby', 'en_us');
    await offerFor(LENA);
    stores.patchSettings('network', { rejoinOffer: false }, 'test');
    await offFor(LENA);
    await proxy.request({ t: 'command', uuid: LENA, command: 'rueckkehr', args: [] });
    await said(proxy, LENA, 'No round is waiting');
    stores.patchSettings('network', { rejoinOffer: true }, 'test');
    await offerFor(LENA);

    // Der Duels-Server ist weg (schläft, neu gestartet): die Runde gibt es nicht mehr.
    duels.close();
    await offFor(LENA);
    await said(proxy, LENA, "can't be reached");
    expect(hub.heldServers()).toEqual([]);
  });

  test('Platz freihalten nur für eigene Spieler eines Spielmodus – und nicht, wer selbst gegangen ist', async () => {
    const { proxy, lobby, duels, join } = await network();
    const party = await plugin('party', 'backend');
    await settle();

    // Party war nie Lenas Server, die Lobby ist kein Spielmodus: beides abgelehnt.
    party.send({ t: 'hold-slot', uuid: LENA, seconds: 120 });
    lobby.send({ t: 'hold-slot', uuid: PHILIP, seconds: 120 });
    await settle();
    expect(hub.heldServers()).toEqual([]);
    // Länger als 30 Sekunden weg: zu spät für Duels.
    proxy.send({ t: 'leave', uuid: LENA });
    await settle();
    clock.now += 31 * SECOND;
    duels.send({ t: 'hold-slot', uuid: LENA, seconds: 120 });
    await settle();
    expect(hub.heldServers()).toEqual([]);

    // Lena geht selbst in die Lobby („Ja“): dafür kein „Zurück ins Spiel“.
    await join(LENA, 'Lena', 'duels', 'en_us');
    duels.send({ t: 'playing', uuid: LENA, playing: true });
    await settle();
    await proxy.request({ t: 'command', uuid: LENA, command: 'lobby', args: ['ja'] });
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    duels.send({ t: 'hold-slot', uuid: LENA, seconds: 120 });
    await settle();
    expect(hub.heldServers()).toEqual([]);
    // Ebenso, wenn der Modus sie selbst schickt (toLobby).
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    await settle();
    duels.send({ t: 'to-lobby', uuid: LENA });
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    duels.send({ t: 'hold-slot', uuid: LENA, seconds: 120 });
    await settle();
    expect(hub.heldServers()).toEqual([]);

    // Selbst gegangen, aber gleich wieder in eine neue Runde – bricht die ab, gilt das Freihalten wieder.
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    await settle();
    duels.send({ t: 'playing', uuid: LENA, playing: true });
    await settle();
    proxy.send({ t: 'leave', uuid: LENA });
    duels.send({ t: 'hold-slot', uuid: LENA, seconds: 120 });
    await settle();
    expect(hub.heldServers()).toEqual(['duels']);
    duels.send({ t: 'hold-slot', uuid: LENA, seconds: 0 });
    await join(LENA, 'Lena', 'lobby', 'en_us');
    expect(hub.heldServers()).toEqual([]);

    // Ein anderer Server kann Lena nicht „zurückbringen“; ein zu langer Wert wird auf eine Stunde begrenzt.
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    clock.now += 20 * SECOND;
    await settle();
    duels.send({ t: 'hold-slot', uuid: LENA, seconds: 99_999 });
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    expect(await lobby.next('rejoin-offer', (m) => m['uuid'] === LENA)).toMatchObject({ seconds: 3_600 });
    const connects = count(proxy, 'connect', LENA);
    duels.send({ t: 'rejoin', uuid: LENA });
    await settle();
    expect(count(proxy, 'connect', LENA)).toBe(connects);
    // Nur Duels selbst nimmt seinen Platz zurück.
    party.send({ t: 'hold-slot', uuid: LENA, seconds: 0 });
    await settle();
    expect(hub.heldServers()).toEqual(['duels']);

    // Im Gefängnis gibt es kein Angebot: die Lobby nimmt es gleich weg, auch nach einem Wechsel kommt keins.
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'gefaengnis', args: ['Lena', '10m', 'Test'] });
    await lobby.next('rejoin-off', (m) => m['uuid'] === LENA);
    const offers = count(lobby, 'rejoin-offer', LENA);
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    await lobby.next('rejoin-off', (m) => m['uuid'] === LENA);
    expect(count(lobby, 'rejoin-offer', LENA)).toBe(offers);
  });

  test('Schlaf-Modus: Wartet ein Modus auf jemanden, schläft er nicht', async () => {
    const MINUTE = 60_000;
    stores.patchSettings('network', { sleepMinutes: 5 }, 'test');
    const motor = {
      request: (_method: string, path: string) =>
        Promise.resolve(
          path === '/api/networks'
            ? [{ name: 'MoinMorni', members: [{ name: 'duels', serverId: 'd1' }] }]
            : undefined,
        ),
    } as unknown as MotorClient;
    const held = new Set(['duels']);
    const sleep = createSleepService(
      motor,
      {
        presence: { counts: () => ({}) } as never,
        connectedServers: () => ['duels'],
        heldServers: () => [...held],
      },
      stores,
      quiet,
    );
    const t0 = Date.parse('2026-11-16T18:00:00Z');
    expect(await sleep.check(t0)).toEqual([]);
    expect(await sleep.check(t0 + 10 * MINUTE)).toEqual([]);
    held.clear();
    expect(await sleep.check(t0 + 11 * MINUTE)).toEqual([]);
    expect(await sleep.check(t0 + 16 * MINUTE)).toEqual(['duels']);
  });
});
