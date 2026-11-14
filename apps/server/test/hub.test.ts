import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import { createHub, type Hub } from '../src/hub/index.js';
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
const MODI = '44444444-4444-4444-4444-444444444444';

describe('Hub', () => {
  let hub: Hub;
  let stores: Stores;
  let url: string;
  let clock: { now: number };
  const open: FakePlugin[] = [];
  const close = (): void => undefined;

  beforeEach(async () => {
    const handle = openDatabase(':memory:');
    const events = createEventBus();
    stores = createStores(handle.db, events);
    clock = { now: Date.parse('2026-11-14T12:00:00Z') };
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
    close();
  });
  afterEach(async () => {
    open.splice(0).forEach((p) => p.close());
    await hub.close();
  });

  const plugin = async (server: string, kind: 'proxy' | 'backend'): Promise<FakePlugin> => {
    const p = await connectPlugin(url, server, kind, hub.keyFor(server));
    open.push(p);
    return p;
  };

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

  test('Handschlag: richtiger Schlüssel → welcome, falscher → zu', async () => {
    const proxy = await plugin('proxy', 'proxy');
    expect(proxy.received[0]).toMatchObject({ t: 'welcome', server: 'proxy', kind: 'proxy' });
    const welcome = proxy.received[0] as unknown as { commands: Array<{ name: string }> };
    expect(welcome.commands.map((c) => c.name)).toContain('ban');
    await proxy.next('network');
    await proxy.next('bans');

    const fake = await connectPlugin(url, 'lobby', 'backend', hub.keyFor('duels'));
    expect(await fake.closed).toBe(4001);
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

  test('Proxy meldet nach dem Neuverbinden alle Spieler – Spielzeit wird gezählt', async () => {
    const { proxy } = await network();
    clock.now += 30 * 60_000;
    proxy.send({ t: 'online', players: [{ uuid: PHILIP, name: 'Philip', server: 'duels', bedrock: false }] });
    await new Promise((r) => setTimeout(r, 100));
    expect(hub.presence.counts()).toEqual({ duels: 1 });
    expect(hub.players.get(LENA)?.playMinutes).toBe(30);
  });
});
