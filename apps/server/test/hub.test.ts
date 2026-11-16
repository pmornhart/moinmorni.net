import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { openDatabase, type Db } from '../src/db/index.js';
import { morniCraftPlayer } from '../src/hub/mornicraft.js';
import { createHub, type Hub } from '../src/hub/index.js';
import { createEventBus } from '../src/lib/events.js';
import { createStores, type Stores } from '../src/panel/stores.js';
import { audioFrame, groupId } from '../src/hub/voice.js';
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
const MODI = '44444444-4444-4444-4444-444444444444';

describe('Hub', () => {
  let hub: Hub;
  let stores: Stores;
  let db: Db;
  let url: string;
  let clock: { now: number };
  let woken: string[];
  let connected: string[];
  let restartsSeen: Array<{ mode: string; server: string; needed: boolean }>;
  const open: FakePlugin[] = [];
  const close = (): void => undefined;

  beforeEach(async () => {
    const handle = openDatabase(':memory:');
    db = handle.db;
    const events = createEventBus();
    connected = [];
    events.on('server.connected', ({ server }) => connected.push(server));
    restartsSeen = [];
    events.on('mode.restart', (r) => restartsSeen.push(r));
    stores = createStores(handle.db, events);
    clock = { now: Date.parse('2026-11-14T12:00:00Z') };
    woken = [];
    hub = createHub({
      secret: SECRET,
      db: handle.db,
      stores,
      events,
      log: quiet,
      timeZone: 'Europe/Berlin',
      now: () => clock.now,
      wake: (server) => {
        woken.push(server);
        return Promise.resolve(true);
      },
    });
    const port = await hub.listen('127.0.0.1', 0);
    url = `ws://127.0.0.1:${port}/hub`;
    close();
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

  test('meldet, wenn sich ein Spielserver anmeldet (Lobby baut danach ihre Welt)', async () => {
    await plugin('proxy', 'proxy');
    await plugin('lobby', 'backend');
    expect(connected).toEqual(['lobby']);
  });

  /** Proxy + zwei Spielserver, Philip (Owner) und Lena (Spielerin) online. */
  const network = async (): Promise<{ proxy: FakePlugin; lobby: FakePlugin; duels: FakePlugin }> => {
    const proxy = await plugin('proxy', 'proxy');
    const lobby = await plugin('lobby', 'backend');
    const duels = await plugin('duels', 'backend');
    const join = async (uuid: string, name: string, server: string, locale = 'de_de'): Promise<Msg> => {
      const r = await proxy.request({ t: 'login', uuid, name, locale, bedrock: false });
      proxy.send({ t: 'switch', uuid, server });
      return r;
    };
    hub.players.seen({ uuid: PHILIP, name: 'Philip', bedrock: false });
    hub.players.setRole(PHILIP, 'owner');
    await join(PHILIP, 'Philip', 'lobby');
    await join(LENA, 'Lena', 'duels', 'en_us');
    await lobby.next('profile', (m) => m['uuid'] === PHILIP);
    await duels.next('profile', (m) => m['uuid'] === LENA);
    return { proxy, lobby, duels };
  };

  test('Spielmodi: nur der Server des Modus meldet Statistiken; Party abfragen; zurück in die Lobby', async () => {
    const { proxy, lobby, duels } = await network();
    duels.send({ t: 'stats', mode: 'duels', uuid: LENA, add: { wins: 1, kills: 3 }, min: { best_ms: 5000 } });
    duels.send({ t: 'stats', mode: 'duels', uuid: LENA, add: { wins: 1 }, min: { best_ms: 7000 } });
    // Die Lobby darf nicht für Duels sprechen.
    lobby.send({ t: 'stats', mode: 'duels', uuid: PHILIP, add: { wins: 99 } });
    duels.send({ t: 'mode-state', mode: 'duels', state: 'running', players: 2 });
    await new Promise((r) => setTimeout(r, 150));
    const top = hub.stats.top('duels', 'wins', 10);
    expect(top.map((e) => [e.name, e.value])).toEqual([['Lena', 2]]);
    expect(hub.stats.ofPlayer(LENA)['duels']).toEqual({ wins: 2, kills: 3, best_ms: 5000 });
    // Bestenlisten: wichtige Werte zuerst, Zeiten aufsteigend
    expect(hub.stats.boards()).toEqual([
      {
        mode: 'duels',
        keys: [
          { key: 'wins', players: 1, order: 'desc' },
          { key: 'kills', players: 1, order: 'desc' },
          { key: 'best_ms', players: 1, order: 'asc' },
        ],
      },
    ]);
    expect(hub.modeStates()['duels']).toMatchObject({ state: 'running', players: 2 });
    // Die Lobby-Figuren erfahren, was der Modus meldet („closed“ = Pause, z. B. Wintersport im Sommer).
    const sign = await lobby.next('lobby', (m) =>
      (m['modes'] as Array<{ id: string; phase: string | null }>).some(
        (x) => x.id === 'duels' && x.phase === 'running',
      ),
    );
    expect((sign['modes'] as Array<{ id: string }>).map((x) => x.id)).toContain('wintersport');
    // Eigener wichtigster Wert eines Modus steht vorne (Wintersport: Gold statt Siege).
    hub.stats.record({
      mode: 'wintersport',
      uuid: LENA,
      add: { wins: 1, gold: 2 },
      min: { time_bob_ms: 61_000 },
    });
    expect(
      hub.stats
        .boards()
        .find((b) => b.mode === 'wintersport')
        ?.keys.map((k) => k.key),
    ).toEqual(['gold', 'wins', 'time_bob_ms']);

    // Party: nur für eigene Spieler; ohne Party null
    const own = await duels.request({ t: 'party', uuid: LENA });
    expect(own).toMatchObject({ ok: true, data: { party: null } });
    const foreign = await duels.request({ t: 'party', uuid: PHILIP });
    expect(foreign).toMatchObject({ ok: false });

    duels.send({ t: 'to-lobby', uuid: LENA });
    const moved = await proxy.next('connect', (m) => m['uuid'] === LENA);
    expect(moved['server']).toBe('lobby');
  });

  test('Handschlag: richtiger Schlüssel → welcome, falscher → zu', async () => {
    const proxy = await plugin('proxy', 'proxy');
    expect(proxy.received[0]).toMatchObject({ t: 'welcome', server: 'proxy', kind: 'proxy' });
    const welcome = proxy.received[0] as unknown as { commands: Array<{ name: string }> };
    expect(welcome.commands.map((c) => c.name)).toContain('ban');
    await proxy.next('network');
    await proxy.next('bans');

    const fake = await connectPlugin(url, 'lobby', 'backend', hub.keyFor('duels', 'backend'));
    expect(await fake.closed).toBe(4001);
    // Ein Spielserver kann sich mit seinem Schlüssel nicht als Proxy anmelden.
    const posing = await connectPlugin(url, 'duels', 'proxy', hub.keyFor('duels', 'backend'));
    expect(await posing.closed).toBe(4001);
  });

  test('Spielserver dürfen keine Proxy-Nachrichten schicken und nicht für fremde Spieler sprechen', async () => {
    const { proxy, lobby, duels } = await network();
    // Duels gibt sich als Proxy aus und will Philip (Owner) einen Befehl ausführen lassen.
    duels.send({ t: 'login', id: 'x1', uuid: PHILIP, name: 'Philip', bedrock: false, locale: 'de' });
    duels.send({ t: 'command', id: 'x2', uuid: PHILIP, command: 'rang', args: ['Lena', 'admin'] });
    // Duels spricht im Chat für Philip – der ist aber in der Lobby.
    duels.send({ t: 'chat', uuid: PHILIP, text: 'gefälscht' });
    await new Promise((r) => setTimeout(r, 150));
    expect(hub.players.roleOf(LENA).id).not.toBe('admin');
    const all = [...proxy.received, ...lobby.received, ...duels.received];
    expect(all.some((m) => JSON.stringify(m).includes('gefälscht'))).toBe(false);
    // Echte Nachricht aus der Lobby kommt an.
    lobby.send({ t: 'chat', uuid: PHILIP, text: 'echt' });
    await duels.next('chat', (m) => JSON.stringify(m).includes('echt'));
  });

  test('veränderter oder wiederholter Rahmen → Verbindung zu', async () => {
    const lobby = await plugin('lobby', 'backend');
    lobby.send({ t: 'chat', uuid: PHILIP, text: 'hallo' });
    lobby.raw(lobby.lastFrame());
    expect(await lobby.closed).toBe(4002);

    const duels = await plugin('duels', 'backend');
    const frame = JSON.parse(JSON.stringify({ s: 1, b: '{"t":"chat"}', h: '0'.repeat(64) })) as object;
    duels.raw(JSON.stringify(frame));
    expect(await duels.closed).toBe(4002);
  });

  test('Anmeldung, Wechsel, Rang-Profil und Spielerzahlen', async () => {
    const { lobby, duels } = await network();
    const philip = lobby.received.find((m) => m.t === 'profile' && m['uuid'] === PHILIP);
    expect(philip).toMatchObject({ name: 'Philip', lang: 'de', role: { id: 'owner', symbol: '♛' } });
    expect(duels.received.find((m) => m.t === 'profile')).toMatchObject({
      lang: 'en',
      role: { id: 'player' },
    });
    expect(hub.presence.counts()).toEqual({ lobby: 1, duels: 1 });
  });

  test('Chat geht an alle Server, mit Rang und Server-Kürzel', async () => {
    const { lobby, duels } = await network();
    lobby.send({ t: 'chat', uuid: PHILIP, text: 'Servus <red>alle' });
    const line = (await duels.next('chat')) as unknown as { text: { de: string; en: string } };
    expect(line.text.de).toBe(
      '<dark_gray>[</dark_gray><gray>Lobby</gray><dark_gray>]</dark_gray> <#ff5555>♛</#ff5555> <#ff5555>Philip</#ff5555> <dark_gray>»</dark_gray> <white>Servus \\<red>alle',
    );
    await lobby.next('chat');
  });

  test('Chat-Regeln: Links, Großbuchstaben, Schimpfwörter, Langsam-Modus', async () => {
    const { proxy, lobby, duels } = await network();
    stores.patchSettings('chat', { slowMode: 5, badWords: ['doof'] }, 'test');
    duels.send({ t: 'chat', uuid: LENA, text: 'komm auf meinserver.net' });
    expect(await proxy.next('msg', (m) => m['uuid'] === LENA)).toMatchObject({
      text: expect.stringContaining('Links'),
    });
    duels.send({ t: 'chat', uuid: LENA, text: 'DAS IST SO DOOF' });
    expect(((await lobby.next('chat')) as unknown as { text: { en: string } }).text.en).toContain(
      'das ist so ***',
    );
    duels.send({ t: 'chat', uuid: LENA, text: 'nochmal' });
    expect(await proxy.next('msg', (m) => m['uuid'] === LENA)).toMatchObject({
      text: expect.stringContaining('Slow down'),
    });
    clock.now += 6000;
    duels.send({ t: 'chat', uuid: LENA, text: 'jetzt aber' });
    await lobby.next('chat', (m) => JSON.stringify(m).includes('jetzt aber'));
  });

  test('/ban: Rauswurf, Bann-Liste, Anmeldung gesperrt; /unban hebt auf', async () => {
    const { proxy } = await network();
    await proxy.next('bans');
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'ban', args: ['Lena', '7d', 'Hacks'] });
    const kick = await proxy.next('kick');
    expect(kick).toMatchObject({ uuid: LENA, text: expect.stringContaining('You are banned') });
    expect(await proxy.next('bans')).toMatchObject({ list: [{ uuid: LENA }] });
    proxy.send({ t: 'leave', uuid: LENA });
    const again = await proxy.request({
      t: 'login',
      uuid: LENA,
      name: 'Lena',
      locale: 'en_us',
      bedrock: false,
    });
    expect(again).toMatchObject({
      ok: true,
      data: { allow: false, message: expect.stringContaining('Hacks') },
    });

    await proxy.request({ t: 'command', uuid: PHILIP, command: 'unban', args: ['lena'] });
    expect(await proxy.next('bans')).toMatchObject({ list: [] });
    const ok = await proxy.request({ t: 'login', uuid: LENA, name: 'Lena', locale: 'en_us', bedrock: false });
    expect(ok).toMatchObject({ data: { allow: true } });
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'strafen', args: ['Lena'] });
    const history = await proxy.next('msg', (m) => String(m['text']).includes('aufgehoben'));
    expect(history['text']).toContain('Hacks');
  });

  test('/mute sperrt den Chat, /unmute gibt ihn frei; Dauer läuft ab', async () => {
    const { proxy, lobby, duels } = await network();
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'mute', args: ['Lena', '10m', 'Spam'] });
    await proxy.next('msg', (m) => m['uuid'] === LENA && String(m['text']).includes('You were muted'));
    duels.send({ t: 'chat', uuid: LENA, text: 'hallo?' });
    await proxy.next('msg', (m) => m['uuid'] === LENA && String(m['text']).includes('You are muted'));
    clock.now += 11 * 60_000;
    duels.send({ t: 'chat', uuid: LENA, text: 'wieder da' });
    await lobby.next('chat', (m) => JSON.stringify(m).includes('wieder da'));
  });

  test('/gefaengnis: in die Zelle der Lobby, keine Modi, Chat nur ans Team, /frei und Ablauf', async () => {
    const { proxy, lobby, duels } = await network();
    const go = (uuid: string, server: string) => proxy.request({ t: 'connecting', uuid, server });
    const said = (uuid: string, part: string) =>
      proxy.next('msg', (m) => m['uuid'] === uuid && String(m['text']).includes(part));
    const jailedNow = (n: number) => (m: Msg) => (m['players'] as unknown[]).length === n;
    await lobby.next('jail', jailedNow(0));

    // Ohne Dauer zehn Minuten; Lena spielt Duels → kommt in die Lobby.
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'gefaengnis', args: ['Lena', 'Beleidigung'] });
    await said(LENA, 'going to jail');
    expect(await proxy.next('connect', (m) => m['uuid'] === LENA)).toMatchObject({ server: 'lobby' });
    const state = await lobby.next('jail', jailedNow(1));
    expect(state).toMatchObject({
      cell: { spawn: { y: 58 }, min: { x: -33 }, max: { x: -27 } },
      players: [
        { uuid: LENA, reason: 'Beleidigung', until: new Date(clock.now + 10 * 60_000).toISOString() },
      ],
    });

    // Kein Modus, nur die Lobby.
    expect(await go(LENA, 'duels')).toMatchObject({ data: { allow: false } });
    await said(LENA, 'in jail');
    expect(await go(LENA, 'lobby')).toMatchObject({ data: { allow: true } });

    // Chat aus der Zelle: nur Team (und andere Eingesperrte), nicht an alle.
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    lobby.send({ t: 'chat', uuid: LENA, text: 'lasst mich raus' });
    const toTeam = await said(PHILIP, 'lasst mich raus');
    expect(toTeam['text']).toContain('⛓');
    expect(duels.received.some((m) => m.t === 'chat' && JSON.stringify(m).includes('lasst mich raus'))).toBe(
      false,
    );

    // /frei: wieder überall hin.
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'frei', args: ['Lena'] });
    await said(LENA, 'free again');
    await lobby.next('jail', jailedNow(0));
    expect(await go(LENA, 'duels')).toMatchObject({ data: { allow: true } });

    // Dauer läuft ab.
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'jail', args: ['Lena', '5m', 'Spam'] });
    await lobby.next('jail', jailedNow(1));
    expect(await go(LENA, 'duels')).toMatchObject({ data: { allow: false } });
    clock.now += 6 * 60_000;
    expect(await go(LENA, 'duels')).toMatchObject({ data: { allow: true } });
  });

  test('Rechte: Spieler darf nicht bannen, niemand bestraft einen höheren Rang', async () => {
    const { proxy } = await network();
    await proxy.request({ t: 'command', uuid: LENA, command: 'ban', args: ['Philip'] });
    expect(await proxy.next('msg', (m) => m['uuid'] === LENA)).toMatchObject({
      text: expect.stringContaining('not allowed'),
    });
    hub.players.seen({ uuid: MODI, name: 'Modi', bedrock: false });
    hub.players.setRole(MODI, 'moderator');
    await proxy.request({ t: 'login', uuid: MODI, name: 'Modi', locale: 'de_de', bedrock: false });
    await proxy.request({ t: 'command', uuid: MODI, command: 'mute', args: ['Philip'] });
    expect(await proxy.next('msg', (m) => m['uuid'] === MODI)).toMatchObject({
      text: expect.stringContaining('höherer Rang'),
    });
  });

  test('/rang: Owner gibt VIP, Moderator darf keine Ränge', async () => {
    const { proxy, duels } = await network();
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'rang', args: ['Lena', 'vip'] });
    expect(await duels.next('profile', (m) => m['uuid'] === LENA)).toMatchObject({
      role: { id: 'vip', symbol: '★' },
    });
    const suggestions = await proxy.request({
      t: 'complete',
      uuid: PHILIP,
      command: 'rang',
      args: ['Lena', 'v'],
    });
    expect(suggestions).toMatchObject({ data: { suggestions: ['vip'] } });
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'rang', args: ['Lena', 'weg'] });
    expect(await duels.next('profile', (m) => m['uuid'] === LENA)).toMatchObject({ role: { id: 'player' } });
  });

  test('/msg und /r über Server hinweg, Sprache aus dem Client und /sprache', async () => {
    const { proxy, lobby, duels } = await network();
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'msg', args: ['lena', 'Kommst', 'du?'] });
    expect(await proxy.next('msg', (m) => m['uuid'] === LENA)).toMatchObject({
      text: expect.stringContaining('Philip → you'),
    });
    await proxy.request({ t: 'command', uuid: LENA, command: 'r', args: ['Gleich!'] });
    expect(
      await proxy.next('msg', (m) => m['uuid'] === PHILIP && String(m['text']).includes('Gleich')),
    ).toMatchObject({
      text: expect.stringContaining('Lena → dich'),
    });
    proxy.send({ t: 'locale', uuid: PHILIP, locale: 'en_gb' });
    expect(await lobby.next('profile', (m) => m['uuid'] === PHILIP && m['lang'] === 'en')).toBeTruthy();
    await proxy.request({ t: 'command', uuid: LENA, command: 'sprache', args: ['de'] });
    expect(await duels.next('profile', (m) => m['uuid'] === LENA)).toMatchObject({ lang: 'de' });
    expect(hub.players.get(LENA)?.language).toBe('de');
    // Selbst gewählt bleibt: eine englische Client-Einstellung ändert nichts mehr.
    proxy.send({ t: 'locale', uuid: LENA, locale: 'en_us' });
    await new Promise((r) => setTimeout(r, 50));
    expect(hub.presence.get(LENA)?.lang).toBe('de');
  });

  test('Wartung: nur das Team kommt rein; volles Netzwerk nur mit Reserveplatz', async () => {
    const { proxy } = await network();
    stores.patchSettings('network', { maintenance: true }, 'test');
    expect(await proxy.next('network', (m) => m['maintenance'] === true)).toMatchObject({
      motd2: expect.stringContaining('Wartung'),
    });
    const finn = await proxy.request({
      t: 'login',
      uuid: FINN,
      name: 'Finn',
      locale: 'de_de',
      bedrock: false,
    });
    expect(finn).toMatchObject({ data: { allow: false, message: expect.stringContaining('Wartung') } });
    hub.players.seen({ uuid: MODI, name: 'Modi', bedrock: false });
    hub.players.setRole(MODI, 'moderator');
    const modi = await proxy.request({
      t: 'login',
      uuid: MODI,
      name: 'Modi',
      locale: 'de_de',
      bedrock: false,
    });
    expect(modi).toMatchObject({ data: { allow: true } });

    stores.patchSettings('network', { maintenance: false, maxPlayers: 3 }, 'test');
    const full = await proxy.request({
      t: 'login',
      uuid: FINN,
      name: 'Finn',
      locale: 'de_de',
      bedrock: false,
    });
    expect(full).toMatchObject({ data: { allow: false, message: expect.stringContaining('voll') } });
  });

  test('Einstellungen per Befehl im Spiel – gleiche Prüfung und Rechte wie im Panel', async () => {
    const { proxy } = await network();
    const cmd = (uuid: string, command: string, ...args: string[]) =>
      proxy.request({ t: 'command', uuid, command, args });
    const said = (uuid: string, part: string) =>
      proxy.next('msg', (m) => m['uuid'] === uuid && String(m['text']).includes(part));

    await cmd(PHILIP, 'chatconfig', 'langsam', '5');
    await said(PHILIP, 'Gespeichert');
    expect(stores.settings('chat')['slowMode']).toBe(5);

    await cmd(PHILIP, 'chatconfig', 'langsam', '999');
    await said(PHILIP, 'passt nicht');
    expect(stores.settings('chat')['slowMode']).toBe(5);

    await cmd(PHILIP, 'wartung', 'an');
    expect(await proxy.next('network', (m) => m['maintenance'] === true)).toBeTruthy();
    await cmd(PHILIP, 'lobby', 'saison', 'ostern');
    expect(stores.settings('lobby')['season']).toBe('easter');
    // Doppelsprung und Jump and Run: Schalter und Kommazahl (wie man sie schreibt) auch im Spiel.
    await cmd(PHILIP, 'lobby', 'doppelsprung', 'staerke', '1,5');
    await cmd(PHILIP, 'lobby', 'doppelsprung', 'aus');
    await cmd(PHILIP, 'lobby', 'jumpandrun', 'schwerer', '20');
    expect(stores.settings('lobby')).toMatchObject({
      doubleJump: false,
      doubleJumpStrength: 1.5,
      jumpHarderFrom: 20,
      jumpAndRun: true,
    });
    await cmd(PHILIP, 'lobby', 'doppelsprung', 'staerke', '3');
    await said(PHILIP, 'passt nicht');
    expect(stores.settings('lobby')['doubleJumpStrength']).toBe(1.5);
    await cmd(PHILIP, 'chatconfig', 'wort', 'hinzu', 'blöd');
    await cmd(PHILIP, 'chatconfig', 'wort', 'hinzu', 'mist');
    await cmd(PHILIP, 'chatconfig', 'wort', 'weg', 'blöd');
    expect(stores.settings('chat')['badWords']).toEqual(['mist']);
    await cmd(PHILIP, 'netzwerk', 'motd', '1', '§aHallo', 'Welt');
    expect(stores.settings('network')['motd1']).toBe('§aHallo Welt');

    await cmd(PHILIP, 'chatconfig');
    await said(PHILIP, 'auch im Panel');

    await cmd(LENA, 'chatconfig', 'langsam', '0');
    await said(LENA, 'not allowed');
    expect(stores.settings('chat')['slowMode']).toBe(5);

    // /lobby ohne Wörter bleibt „ab in die Lobby“.
    await cmd(LENA, 'lobby');
    await said(LENA, 'lobby');

    const tab = await proxy.request({ t: 'complete', uuid: PHILIP, command: 'chatconfig', args: ['l'] });
    expect(tab).toMatchObject({ data: { suggestions: ['langsam', 'links'] } });
    const onOff = await proxy.request({
      t: 'complete',
      uuid: PHILIP,
      command: 'chatconfig',
      args: ['links', ''],
    });
    expect(onOff).toMatchObject({ data: { suggestions: ['an', 'aus'] } });
    const season = await proxy.request({
      t: 'complete',
      uuid: PHILIP,
      command: 'lobby',
      args: ['saison', 'w'],
    });
    expect(season).toMatchObject({ data: { suggestions: ['wiesn', 'winter'] } });
  });

  test('Freunde: Anfrage mit Knopf, annehmen, Liste, online/offline-Hinweis', async () => {
    const { proxy } = await network();
    const cmd = (uuid: string, command: string, ...args: string[]) =>
      proxy.request({ t: 'command', uuid, command, args });
    const said = (uuid: string, part: string) =>
      proxy.next('msg', (m) => m['uuid'] === uuid && String(m['text']).includes(part));

    await cmd(PHILIP, 'freunde', 'add', 'Lena');
    await said(PHILIP, 'Anfrage an');
    const got = await said(LENA, 'wants to be your friend');
    expect(got['text']).toContain("<click:run_command:'/friends accept Philip'>");
    await cmd(LENA, 'friends', 'accept', 'Philip');
    await said(LENA, 'friends now');
    await said(PHILIP, 'jetzt Freunde');

    await cmd(PHILIP, 'freunde');
    await said(PHILIP, '1 online');
    await said(PHILIP, 'auf duels');

    proxy.send({ t: 'leave', uuid: LENA });
    await said(PHILIP, 'offline gegangen');
    await proxy.request({ t: 'login', uuid: LENA, name: 'Lena', locale: 'en_us', bedrock: false });
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    await said(PHILIP, 'ist jetzt online');

    await cmd(PHILIP, 'freunde', 'entfernen', 'Lena');
    await said(PHILIP, 'nicht mehr in deiner Freundesliste');
  });

  test('Party: einladen, beitreten, Party-Chat, folgt dem Leiter, auflösen', async () => {
    const { proxy } = await network();
    const cmd = (uuid: string, command: string, ...args: string[]) =>
      proxy.request({ t: 'command', uuid, command, args });
    const said = (uuid: string, part: string) =>
      proxy.next('msg', (m) => m['uuid'] === uuid && String(m['text']).includes(part));

    await cmd(PHILIP, 'party', 'einladen', 'Lena');
    expect((await said(LENA, 'invites you'))['text']).toContain("'/party accept Philip'");
    await cmd(LENA, 'party', 'accept', 'Philip');
    await said(PHILIP, 'beigetreten');

    await cmd(LENA, 'pc', 'Bin', 'dabei!');
    await said(PHILIP, 'Bin dabei!');

    // Philip (Leiter) geht nach Duels und wieder in die Lobby – Lena kommt mit.
    proxy.send({ t: 'switch', uuid: PHILIP, server: 'lobby' });
    proxy.send({ t: 'switch', uuid: PHILIP, server: 'duels' });
    proxy.send({ t: 'switch', uuid: LENA, server: 'duels' });
    proxy.send({ t: 'switch', uuid: PHILIP, server: 'lobby' });
    expect(await proxy.next('connect', (m) => m['uuid'] === LENA)).toMatchObject({ server: 'lobby' });
    await said(LENA, 'coming along');

    await cmd(LENA, 'party', 'kick', 'Philip');
    await said(LENA, 'Only the party leader');
    await cmd(LENA, 'party', 'leave');
    await said(PHILIP, 'aufgelöst');
    await cmd(PHILIP, 'party');
    await said(PHILIP, 'in keiner Party');
  });

  test('Schlafende Modi wachen auf, wer wartet, kommt danach von selbst hinein', async () => {
    const { proxy } = await network();
    const go = (uuid: string, server: string) => proxy.request({ t: 'connecting', uuid, server });
    const said = (uuid: string, part: string) =>
      proxy.next('msg', (m) => m['uuid'] === uuid && String(m['text']).includes(part));

    expect(await go(LENA, 'lobby')).toMatchObject({ data: { allow: true } });
    expect(await go(LENA, 'duels')).toMatchObject({ data: { allow: true } });

    // Morni Party schläft (kein Plugin verbunden): Lena wartet, der Server wird geweckt.
    expect(await go(LENA, 'party')).toMatchObject({ data: { allow: false } });
    await said(LENA, 'waking up');
    expect(await go(PHILIP, 'party')).toMatchObject({ data: { allow: false } });
    expect(woken).toEqual(['party']);
    await plugin('party', 'backend');
    expect(await proxy.next('connect', (m) => m['uuid'] === LENA)).toMatchObject({ server: 'party' });
    expect(await proxy.next('connect', (m) => m['uuid'] === PHILIP)).toMatchObject({ server: 'party' });
    await said(LENA, 'is awake');

    // Geschlossen und Wartung. Geschlossen gilt für Spieler – das Team kommt zum Vorbereiten trotzdem hinein.
    expect(await go(LENA, 'mornicraft')).toMatchObject({ data: { allow: false } });
    await said(LENA, 'closed');
    await go(PHILIP, 'mornicraft');
    await said(PHILIP, 'als Team trotzdem rein');
    stores.patchMode('duels', { state: 'maintenance' }, 'test');
    expect(await go(LENA, 'duels')).toMatchObject({ data: { allow: false } });
    await said(LENA, 'maintenance');
    expect(await go(PHILIP, 'duels')).toMatchObject({ data: { allow: true } });
  });

  test('Bau-Server nur fürs Bauteam: /bau weckt ihn, Spieler kommen nicht hinein', async () => {
    const { proxy } = await network();
    const go = (uuid: string) => proxy.request({ t: 'connecting', uuid, server: 'bau' });
    expect(await go(LENA)).toMatchObject({ data: { allow: false } });
    await proxy.next('msg', (m) => m['uuid'] === LENA && String(m['text']).includes('build team'));
    // /bau ohne Recht: die gleiche freundliche Antwort statt „nicht erlaubt“.
    await proxy.request({ t: 'command', uuid: LENA, command: 'bau', args: [] });
    await proxy.next('msg', (m) => m['uuid'] === LENA && String(m['text']).includes('build team'));
    // Philip (Owner, darf bauen): der Bau-Server schläft → /bau weckt ihn, danach geht es von selbst hinein.
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'bau', args: [] });
    await proxy.next('msg', (m) => m['uuid'] === PHILIP && String(m['text']).includes('Bau-Server'));
    expect(woken).toContain('bau');
    await plugin('bau', 'backend');
    expect(await proxy.next('connect', (m) => m['uuid'] === PHILIP)).toMatchObject({ server: 'bau' });
  });

  test('Lobby-Figuren: Klick bringt in den Modus, Spielerzahlen kommen live an die Server', async () => {
    const { proxy, lobby } = await network();
    type Row = { id: string; players: number; awake: boolean };
    const row = (m: Msg, id: string): Row | undefined => (m['modes'] as Row[]).find((md) => md.id === id);
    const said = (uuid: string, part: string) =>
      proxy.next('msg', (m) => m['uuid'] === uuid && String(m['text']).includes(part));

    // Lena ist in Duels (wach), Morni Party schläft.
    const state = await lobby.next('lobby', (m) => row(m, 'duels')?.players === 1);
    expect(row(state, 'duels')).toMatchObject({ awake: true, players: 1 });
    expect(row(state, 'party')).toMatchObject({ awake: false, players: 0 });

    // Klick auf die Duels-Figur → Proxy verbindet.
    lobby.send({ t: 'play', uuid: PHILIP, mode: 'duels' });
    expect(await proxy.next('connect', (m) => m['uuid'] === PHILIP)).toMatchObject({ server: 'duels' });
    // Die Lobby spricht nicht für Lena – die ist gerade in Duels.
    lobby.send({ t: 'play', uuid: LENA, mode: 'duels' });
    // Schlafender Modus wird geweckt, geschlossener sagt Bescheid.
    lobby.send({ t: 'play', uuid: PHILIP, mode: 'party' });
    await said(PHILIP, 'wacht gerade auf');
    expect(woken).toEqual(['party']);
    lobby.send({ t: 'play', uuid: PHILIP, mode: 'mornicraft' });
    await said(PHILIP, 'geschlossen');
    // Wintersport im Sommer: Figur sagt „Sommerpause“, ein Klick bringt trotzdem ins Dorf.
    const winter = await plugin('wintersport', 'backend');
    winter.send({ t: 'mode-state', mode: 'wintersport', state: 'closed', players: 0 });
    const paused = await lobby.next(
      'lobby',
      (m) => (row(m, 'wintersport') as { phase?: string })?.phase === 'closed',
    );
    expect(row(paused, 'wintersport')).toMatchObject({ awake: true });
    lobby.send({ t: 'play', uuid: PHILIP, mode: 'wintersport' });
    await said(PHILIP, 'Sommerpause');
    expect(await proxy.next('connect', (m) => m['uuid'] === PHILIP)).toMatchObject({ server: 'wintersport' });

    // Wechsel → neue Zahlen kommen an.
    proxy.send({ t: 'switch', uuid: PHILIP, server: 'duels' });
    await lobby.next('lobby', (m) => row(m, 'duels')?.players === 2);
  });

  test('Lobby-Einstellungen: nur die Lobby bekommt sie, Änderungen im Panel kommen sofort an', async () => {
    const { lobby, duels } = await network();
    const first = await lobby.next('lobby-settings');
    expect(first).toMatchObject({
      welcome: { title: 'Servus in MoinMorni!' },
      season: 'none',
      jumpAndRun: { on: true, harderFrom: 10 },
      doubleJump: { on: true, strength: 1 },
    });
    const features = first['features'] as {
      jump: { start: { x: number }; lanes: unknown[] };
      tour: unknown[];
      launchpads: unknown[];
    };
    expect(features.jump.lanes.length).toBe(9);
    expect(features.jump.start.x).toBe(-60);
    expect(features.tour.length).toBeGreaterThan(3);
    expect(features.launchpads.length).toBe(2);
    stores.patchSettings('lobby', { season: 'wiesn', walkers: 3 }, 'test');
    expect(await lobby.next('lobby-settings')).toMatchObject({ season: 'wiesn', walkers: 3 });
    stores.patchSettings('lobby', { doubleJump: false, doubleJumpStrength: 1.5, jumpHarderFrom: 25 }, 'test');
    expect(await lobby.next('lobby-settings')).toMatchObject({
      doubleJump: { on: false, strength: 1.5 },
      jumpAndRun: { on: true, harderFrom: 25 },
    });
    expect(duels.received.some((m) => m.t === 'lobby-settings')).toBe(false);
  });

  test('Jump and Run: nur die Lobby meldet Werte unter „lobby“, sie stehen im Profil und in der Bestenliste', async () => {
    const { lobby, duels } = await network();
    lobby.send({
      t: 'stats',
      mode: 'lobby',
      uuid: PHILIP,
      add: { jump_runs: 1, jumps: 12 },
      max: { jump_best: 12 },
    });
    lobby.send({
      t: 'stats',
      mode: 'lobby',
      uuid: PHILIP,
      add: { jump_runs: 1, jumps: 7 },
      max: { jump_best: 7 },
    });
    // Ein Spielserver darf nicht für die Lobby sprechen.
    duels.send({ t: 'stats', mode: 'lobby', uuid: LENA, max: { jump_best: 999 } });
    await new Promise((r) => setTimeout(r, 150));
    expect(hub.stats.ofPlayer(PHILIP)['lobby']).toEqual({ jump_runs: 2, jumps: 19, jump_best: 12 });
    expect(hub.stats.ofPlayer(LENA)['lobby']).toBeUndefined();
    expect(hub.stats.top('lobby', 'jump_best', 10).map((e) => [e.name, e.value])).toEqual([['Philip', 12]]);
    // Der Rekord steht in der Bestenliste der Lobby ganz vorne.
    expect(hub.stats.boards().find((b) => b.mode === 'lobby')?.keys[0]).toEqual({
      key: 'jump_best',
      players: 1,
      order: 'desc',
    });
  });

  test('MorniCraft-Einstellungen: nur der MorniCraft-Server bekommt sie, Änderungen im Panel und per Befehl sofort', async () => {
    const { proxy, duels } = await network();
    const mc = await plugin('mornicraft', 'backend');
    const first = (await mc.next('mornicraft-settings')) as unknown as { config: Record<string, unknown> };
    expect(first.config).toMatchObject({
      'server-name': 'MorniCraft auf MoinMorni',
      'teleport-delay': 5,
      'max-homes': 5,
      limits: { spawn: { uses: 0, hours: 24 } },
      clans: { enabled: true, 'max-members': 10 },
      'hard-dragon': true,
      dragon: { health: 600, damage: 175, egg: true },
      'update-check': false,
      network: { address: 'moinmorni.net', 'panel-players': 'https://moinmorni.net/panel/spieler' },
    });
    // Regeln wie auf der Webseite, eine pro Zeile, beide Sprachen.
    const rules = first.config['network'] as { 'rules-de': string[]; 'rules-en': string[] };
    expect(rules['rules-de'].length).toBe(5);
    expect(rules['rules-en'][0]).toContain('Be kind');

    stores.patchSettings('mornicraft', { teleportDelay: 0, spawnLimit: 3, dragonHealth: 1200 }, 'test');
    expect(await mc.next('mornicraft-settings')).toMatchObject({
      config: { 'teleport-delay': 0, limits: { spawn: { uses: 3, hours: 24 } }, dragon: { health: 1200 } },
    });
    // Im Spiel per Befehl (Owner) – gleiche Prüfung wie im Panel.
    await proxy.request({
      t: 'command',
      uuid: PHILIP,
      command: 'mornicraft',
      args: ['drache', 'leben', '900'],
    });
    expect(await mc.next('mornicraft-settings')).toMatchObject({ config: { dragon: { health: 900 } } });
    await proxy.request({
      t: 'command',
      uuid: PHILIP,
      command: 'mornicraft',
      args: ['grenze', 'spawn-zeit', '1'],
    });
    expect(await mc.next('mornicraft-settings')).toMatchObject({
      config: { limits: { spawn: { hours: 1 } } },
    });
    await proxy.request({
      t: 'command',
      uuid: PHILIP,
      command: 'mornicraft',
      args: ['befehl', 'tpa', 'aus'],
    });
    expect(await mc.next('mornicraft-settings')).toMatchObject({ config: { tpa: false } });
    expect(stores.settings('mornicraft')['tpa']).toBe(false);
    await proxy.request({ t: 'command', uuid: LENA, command: 'mornicraft', args: ['clans', 'aus'] });
    expect(stores.settings('mornicraft')['clans']).toBe(true);
    // Neue Regeln auf der Webseite → auch MorniCraft.
    stores.patchSettings('website', { rulesDe: 'Eins\nZwei' }, 'test');
    expect(await mc.next('mornicraft-settings')).toMatchObject({
      config: { network: { 'rules-de': ['Eins', 'Zwei'] } },
    });
    expect(duels.received.some((m) => m.t === 'mornicraft-settings')).toBe(false);
  });

  test('Einstellungen der Spielmodi: nur der Server des Modus bekommt sie (Pfad → Wert), Panel und Befehl, Neustart-Meldung', async () => {
    const { proxy, lobby, duels } = await network();
    // Beim Verbinden schon geschickt (network() verbindet Duels): Standardwerte = mitgelieferte config.yml.
    const first = (await duels.next('mode-settings')) as unknown as {
      mode: string;
      plugin: string;
      values: Record<string, unknown>;
    };
    expect(first).toMatchObject({ mode: 'duels', plugin: 'MoinMorniDuels' });
    expect(first.values).toMatchObject({
      'kampf.zeitlimit-sekunden': 600,
      'suppe.heilung': 7,
      'arena-kopien': 3,
    });
    const party = await plugin('party', 'backend');
    const partyFirst = (await party.next('mode-settings')) as unknown as { values: Record<string, unknown> };
    expect(partyFirst.values).toMatchObject({
      'minispiele.auswahl': [],
      // Listen gehen als Ganzes – so entstehen auch neue Listen in einer älteren config.yml.
      'edelweiss-jagd-runden': [10, 15, 20],
      'regeln.minispiel-taler': [10, 6, 4, 3, 2, 1, 1, 1],
      'minispiel-marathon.runden': [6, 10, 15],
      'auszeichnungen.welche': [],
    });
    // Neue Modi genauso: Angelkönig-Preise sind eine Liste, Wintersport hat eine Auswahl.
    const angel = await plugin('angelkoenig', 'backend');
    const angelFirst = (await angel.next('mode-settings')) as unknown as {
      plugin: string;
      values: Record<string, unknown>;
    };
    expect(angelFirst.plugin).toBe('MorniAngelkoenig');
    expect(angelFirst.values).toMatchObject({ 'turnier.preise': [250, 120, 60], 'turnier.alle-minuten': 15 });
    await proxy.request({
      t: 'command',
      uuid: PHILIP,
      command: 'angelconfig',
      args: ['turnier', 'preis1', '300'],
    });
    expect(await angel.next('mode-settings')).toMatchObject({ values: { 'turnier.preise': [300, 120, 60] } });
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'winterconfig', args: ['saison', 'winter'] });
    expect(stores.settings('wintersport')['season']).toBe('winter');
    // Neue Einstellungen der Modi gehen auch im Spiel: Marathon (Stelle einer Liste), Kramerladen und Kramerkiste
    // von Versteckerl, Händlerhaus von MorniSMP – und landen nur beim jeweiligen Modus.
    await proxy.request({
      t: 'command',
      uuid: PHILIP,
      command: 'partyconfig',
      args: ['marathon', 'wahl2', '12'],
    });
    expect(await party.next('mode-settings')).toMatchObject({
      values: { 'minispiel-marathon.runden': [6, 12, 15] },
    });
    const hide = await plugin('versteckerl', 'backend');
    expect(await hide.next('mode-settings')).toMatchObject({
      plugin: 'MorniVersteckerl',
      values: { 'laden.pfiffe.kuhglocke.preis': 160, 'rundenladen.laterne.an': true, 'punkte.fund': 10 },
    });
    await proxy.request({
      t: 'command',
      uuid: PHILIP,
      command: 'versteckconfig',
      args: ['laden', 'pfiff', 'kuhglocke', 'preis', '200'],
    });
    expect(await hide.next('mode-settings')).toMatchObject({
      values: { 'laden.pfiffe.kuhglocke.preis': 200 },
    });
    await proxy.request({
      t: 'command',
      uuid: PHILIP,
      command: 'versteckconfig',
      args: ['kiste', 'laterne', 'aus'],
    });
    expect(await hide.next('mode-settings')).toMatchObject({
      values: { 'rundenladen.laterne.an': false, 'rundenladen.laterne.preis': 8 },
    });
    const smp = await plugin('smp', 'backend');
    expect(await smp.next('mode-settings')).toMatchObject({
      plugin: 'MorniSMP',
      values: { 'haendler.an': true },
    });
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'smpconfig', args: ['haendler', 'aus'] });
    expect(await smp.next('mode-settings')).toMatchObject({ values: { 'haendler.an': false } });
    expect(
      hide.received.filter((m) => m.t === 'mode-settings').every((m) => m['mode'] === 'versteckerl'),
    ).toBe(true);
    // Panel: nur Duels bekommt die neuen Werte.
    stores.patchSettings('duels', { timeLimit: 300, soupHeal: 6.5 }, 'test');
    expect(await duels.next('mode-settings')).toMatchObject({
      values: { 'kampf.zeitlimit-sekunden': 300, 'suppe.heilung': 6.5 },
    });
    // Im Spiel per Befehl (Owner), Komma geht auch.
    await proxy.request({
      t: 'command',
      uuid: PHILIP,
      command: 'partyconfig',
      args: ['minispiele', 'dauer', '0,5'],
    });
    expect(await party.next('mode-settings')).toMatchObject({ values: { 'minispiele.dauer-faktor': 0.5 } });
    await proxy.request({
      t: 'command',
      uuid: PHILIP,
      command: 'partyconfig',
      args: ['minispiel', 'kuhglocke', 'aus'],
    });
    const chosen = (await party.next('mode-settings')) as unknown as { values: Record<string, string[]> };
    expect(chosen.values['minispiele.auswahl']).not.toContain('kuhglocke');
    expect(chosen.values['minispiele.auswahl']).toContain('rempelei');
    // Lena (Spielerin) darf nicht.
    await proxy.request({ t: 'command', uuid: LENA, command: 'duelsconfig', args: ['zeitlimit', '60'] });
    expect(stores.settings('duels')['timeLimit']).toBe(300);
    expect(lobby.received.some((m) => m.t === 'mode-settings')).toBe(false);
    expect(duels.received.filter((m) => m.t === 'mode-settings').every((m) => m['mode'] === 'duels')).toBe(
      true,
    );

    // Neustart nötig: nur der Server des Modus darf es melden.
    lobby.send({ t: 'mode-settings-state', mode: 'duels', restart: true, changed: 2 });
    duels.send({ t: 'mode-settings-state', mode: 'duels', restart: true, changed: 2 });
    await new Promise((r) => setTimeout(r, 150));
    expect(restartsSeen).toEqual([{ mode: 'duels', server: 'duels', needed: true }]);
    expect(hub.modeRestarts()).toEqual(['duels']);
    // Server geht weg (Neustart oder Schlaf): nicht mehr offen.
    duels.close();
    await new Promise((r) => setTimeout(r, 150));
    expect(hub.modeRestarts()).toEqual([]);
    expect(restartsSeen.at(-1)).toEqual({ mode: 'duels', server: 'duels', needed: false });
  });

  test('MorniCraft meldet Spieler-Daten fürs Panel: nur der MorniCraft-Server, nur gültige', async () => {
    const { duels } = await network();
    const mc = await plugin('mornicraft', 'backend');
    const data = {
      online: true,
      afk: false,
      homes: [{ name: 'basis', world: 'world', x: 10, y: 64, z: -5 }],
      clan: { name: 'Testclan', tag: 'TC', colour: '#7dd3fc', leader: true, members: 1 },
      graves: [{ world: 'world', x: 1, y: 2, z: 3, items: 12, since: 1 }],
    };
    duels.send({ t: 'mode-player', mode: 'mornicraft', uuid: LENA, data });
    mc.send({ t: 'mode-player', mode: 'mornicraft', uuid: PHILIP, data: { ...data, homes: 'kaputt' } });
    mc.send({ t: 'mode-player', mode: 'mornicraft', uuid: LENA, data: { ...data, extra: '<b>' } });
    await new Promise((r) => setTimeout(r, 150));
    expect(morniCraftPlayer(db, PHILIP)).toBeNull();
    const lena = morniCraftPlayer(db, LENA);
    expect(lena).toMatchObject({
      homes: [{ name: 'basis', x: 10 }],
      clan: { tag: 'TC' },
      graves: [{ items: 12 }],
    });
    expect(lena).not.toHaveProperty('extra');
  });

  test('Chat: Clan-Kürzel des Modus-Servers steht nach dem Rang; falsches Kürzel wird abgelehnt', async () => {
    const { lobby, duels } = await network();
    lobby.send({ t: 'chat', uuid: PHILIP, text: 'hallo', tag: { text: 'MC', colour: '#ef4444' } });
    const line = (await duels.next('chat')) as unknown as { text: { de: string } };
    expect(line.text.de).toContain('<#ff5555>♛</#ff5555> <#ef4444>[MC]</#ef4444> <#ff5555>Philip</#ff5555>');
    lobby.send({ t: 'chat', uuid: PHILIP, text: 'böse', tag: { text: '<red>x', colour: '#ef4444' } });
    lobby.send({ t: 'chat', uuid: PHILIP, text: 'danach' });
    const next = (await duels.next('chat')) as unknown as { text: { de: string } };
    expect(next.text.de).toContain('danach');
    expect(duels.received.some((m) => JSON.stringify(m).includes('böse'))).toBe(false);
  });

  test('Sprachchat-Brücke: Kanäle über alle Server, kein Sprechen für andere, Stumm, Party, Team folgt', async () => {
    const { proxy, lobby, duels } = await network();
    const cmd = (uuid: string, command: string, ...args: string[]) =>
      proxy.request({ t: 'command', uuid, command, args });
    const dorf = groupId('Dorfplatz');
    const config = await duels.next('voice');
    expect(config['channels']).toEqual(expect.arrayContaining([{ id: dorf, name: 'Dorfplatz' }]));
    const settle = () => new Promise((r) => setTimeout(r, 80));
    // Philip ist in der Lobby im Dorfplatz, Lena in Duels – Ton geht nur dorthin, wo jemand aus dem Kanal ist.
    duels.send({ t: 'voice-group', uuid: LENA, group: dorf });
    lobby.send({ t: 'voice-group', uuid: PHILIP, group: dorf });
    await settle();

    lobby.sendBinary(audioFrame(dorf, PHILIP, Buffer.from([1, 2, 3])));
    await settle();
    expect(duels.binaries.at(-1)).toEqual(audioFrame(dorf, PHILIP, Buffer.from([1, 2, 3])));
    expect(lobby.binaries).toHaveLength(0);

    // Duels behauptet, Philip spreche dort – er ist aber in der Lobby: wird verworfen. Fremde Gruppe ebenso.
    duels.sendBinary(audioFrame(dorf, PHILIP, Buffer.from([9])));
    lobby.sendBinary(audioFrame(groupId('Geheim'), PHILIP, Buffer.from([9])));
    await settle();
    expect(lobby.binaries).toHaveLength(0);
    expect(duels.binaries).toHaveLength(1);

    await cmd(PHILIP, 'voicemute', 'Lena', '10m', 'Lärm');
    expect(await duels.next('voice', (m) => (m['muted'] as string[]).includes(LENA))).toBeTruthy();
    duels.sendBinary(audioFrame(dorf, LENA, Buffer.from([4])));
    await settle();
    expect(lobby.binaries).toHaveLength(0);
    await cmd(PHILIP, 'voiceunmute', 'Lena');
    duels.sendBinary(audioFrame(dorf, LENA, Buffer.from([5])));
    await settle();
    expect(lobby.binaries).toHaveLength(1);

    await cmd(LENA, 'voice', 'Dorfplatz');
    expect(await duels.next('voice-join', (m) => m['uuid'] === LENA)).toMatchObject({ group: dorf });
    duels.send({ t: 'voice-group', uuid: LENA, group: dorf });
    await settle();
    await cmd(PHILIP, 'voice', 'zu', 'Lena');
    expect(await lobby.next('voice-join', (m) => m['uuid'] === PHILIP)).toMatchObject({
      group: dorf,
      force: true,
    });

    await cmd(PHILIP, 'party', 'einladen', 'Lena');
    await cmd(LENA, 'party', 'annehmen', 'Philip');
    const withParty = await duels.next('voice', (m) => (m['parties'] as unknown[]).length === 1);
    const party = (withParty['parties'] as Array<{ id: string; name: string; members: string[] }>)[0];
    expect(party).toMatchObject({ name: 'Party Philip', members: [PHILIP, LENA] });
    duels.send({ t: 'voice-group', uuid: LENA, group: party?.id ?? null });
    await settle();
    lobby.sendBinary(audioFrame(party?.id ?? '', PHILIP, Buffer.from([7])));
    await settle();
    expect(duels.binaries.at(-1)?.at(-1)).toBe(7);
  });

  test('Sprachchat-Stumm über die Moderation: Meldung an Spieler und Team, Verlauf, Ablauf, Aufheben, Recht', async () => {
    const { proxy, duels } = await network();
    const cmd = (uuid: string, command: string, ...args: string[]) =>
      proxy.request({ t: 'command', uuid, command, args });
    const said = (uuid: string, part: string) =>
      proxy.next('msg', (m) => m['uuid'] === uuid && String(m['text']).includes(part));
    const mutedList = (m: Msg) => m['muted'] as string[];
    const MUTE_MINUTES = 10;
    const MINUTE_MS = 60_000;
    await duels.next('voice');

    // Wie im Panel: Dauer und Grund, Lena (englisch) liest es, das Team bekommt einen Hinweis.
    await cmd(PHILIP, 'voicemute', 'Lena', `${MUTE_MINUTES}m`, 'zu laut');
    await said(LENA, 'You are muted in voice chat');
    await said(PHILIP, 'im Sprachchat stummgeschaltet');
    expect(mutedList(await duels.next('voice', (m) => mutedList(m).includes(LENA)))).toEqual([LENA]);
    const entry = hub.punish.history(LENA)[0];
    expect(entry).toMatchObject({ kind: 'voice', reason: 'zu laut', byName: 'Philip' });
    expect(Date.parse(entry?.expiresAt ?? '') - clock.now).toBe(MUTE_MINUTES * MINUTE_MS);
    // Chat schreiben geht weiter – nur der Sprachchat ist stumm.
    expect(hub.punish.active(LENA, 'mute')).toBeUndefined();

    // Nach zehn Minuten vorbei: die Spielserver bekommen die neue Liste (sie halten Stumme selbst zurück).
    clock.now += (MUTE_MINUTES + 1) * MINUTE_MS;
    duels.send({ t: 'voice-group', uuid: LENA, group: null });
    expect(mutedList(await duels.next('voice', (m) => !mutedList(m).includes(LENA)))).toEqual([]);

    // Ohne Dauer für immer, /voiceunmute hebt auf; ein zweites Mal gibt es nichts aufzuheben.
    await cmd(PHILIP, 'voicemute', 'Lena', 'Dauerlärm');
    expect(hub.punish.active(LENA, 'voice')).toMatchObject({ reason: 'Dauerlärm', expiresAt: null });
    await cmd(PHILIP, 'voiceunmute', 'Lena');
    await said(LENA, 'You can speak in voice chat again');
    await said(PHILIP, 'im Sprachchat freigegeben');
    await duels.next('voice', (m) => !mutedList(m).includes(LENA));
    await cmd(PHILIP, 'voiceunmute', 'Lena');
    await said(PHILIP, 'ist im Sprachchat nicht stumm');

    // Ohne das Recht „voice-mute“ (Lena ist Spielerin) geht es nicht.
    await cmd(LENA, 'voicemute', 'Philip');
    expect(hub.punish.active(PHILIP, 'voice')).toBeUndefined();
  });

  test('Eigene Sprachgruppen für alle Server: Passwort, besetzter Name, leer → weg, im Panel aus, Hörweite', async () => {
    const { proxy, lobby, duels } = await network();
    const cmd = (uuid: string, command: string, ...args: string[]) =>
      proxy.request({ t: 'command', uuid, command, args });
    const said = (uuid: string, part: string) =>
      proxy.next('msg', (m) => m['uuid'] === uuid && String(m['text']).includes(part));
    const settle = () => new Promise((r) => setTimeout(r, 80));
    const ownCount = (n: number) => (m: Msg) => (m['own'] as unknown[]).length === n;
    expect(await duels.next('voice')).toMatchObject({ ownGroups: true, distance: 32, own: [] });

    // Lena legt eine Gruppe mit Passwort an – auf jedem Server, sie selbst ist gleich drin.
    await cmd(LENA, 'voice', 'gruppe', 'Gipfel', 'geheim1');
    const made = await lobby.next('voice', ownCount(1));
    const g = (made['own'] as Array<{ id: string; name: string; locked: boolean }>)[0];
    // Das Passwort bleibt im Hub – Spielserver erfahren nur, dass die Gruppe abgeschlossen ist.
    expect(g).toEqual({ id: g?.id, name: 'Gipfel', locked: true });
    expect(JSON.stringify(made)).not.toContain('geheim1');
    expect(await duels.next('voice-join', (m) => m['uuid'] === LENA)).toMatchObject({
      group: g?.id,
      force: true,
    });
    duels.send({ t: 'voice-group', uuid: LENA, group: g?.id ?? null });
    // Niemand aus der Gruppe in der Lobby: die Lobby hört nichts mit.
    const before = lobby.binaries.length;
    duels.sendBinary(audioFrame(g?.id ?? '', LENA, Buffer.from([2])));
    await settle();
    expect(lobby.binaries.length).toBe(before);

    // Ohne Team-Recht nur mit Passwort; gleicher Name geht nicht.
    hub.players.setRole(PHILIP, 'player');
    await cmd(PHILIP, 'voice', 'Gipfel');
    await said(PHILIP, 'Passwort');
    await cmd(PHILIP, 'voice', 'Gipfel', 'geheim1');
    expect(await lobby.next('voice-join', (m) => m['uuid'] === PHILIP)).toMatchObject({ group: g?.id });
    lobby.send({ t: 'voice-group', uuid: PHILIP, group: g?.id ?? null });
    await settle();
    duels.sendBinary(audioFrame(g?.id ?? '', LENA, Buffer.from([3])));
    await settle();
    expect(lobby.binaries.at(-1)?.at(-1)).toBe(3);
    await cmd(PHILIP, 'voice', 'gruppe', 'gipfel');
    await said(PHILIP, 'gibt es schon');

    // Leer: nach fünf Minuten weg.
    duels.send({ t: 'voice-group', uuid: LENA, group: null });
    await settle();
    clock.now += 6 * 60_000;
    duels.send({ t: 'voice-group', uuid: LENA, group: null });
    await lobby.next('voice', ownCount(0));

    // Im Panel aus + Hörweite: kommt sofort an, Anlegen wird abgelehnt.
    stores.patchSettings('voice', { ownGroups: false, distance: 48 }, 'test');
    expect(await duels.next('voice', (m) => m['ownGroups'] === false)).toMatchObject({ distance: 48 });
    await cmd(LENA, 'voice', 'gruppe', 'Neu');
    await said(LENA, 'switched off');
  });

  test('Proxy meldet nach dem Neuverbinden alle Spieler – Spielzeit wird gezählt', async () => {
    const { proxy } = await network();
    clock.now += 30 * 60_000;
    proxy.send({ t: 'online', players: [{ uuid: PHILIP, name: 'Philip', server: 'duels', bedrock: false }] });
    await new Promise((r) => setTimeout(r, 100));
    expect(hub.presence.counts()).toEqual({ duels: 1 });
    expect(hub.players.get(LENA)?.playMinutes).toBe(30);
  });
});
