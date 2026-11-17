/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { DEFAULT_ROLES, type Role } from '@moinmorni/shared';
import { badgePackOf } from '../src/badges/pack.js';
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
const URL_BASE = 'https://moinmorni.test/api/public/packs/abzeichen.zip?v=';
const OWNER = DEFAULT_ROLES.find((r) => r.id === 'owner')!;

/** Rang der Reihe nach durchzählen (0, 1, 2 …), wie das Panel die Reihenfolge speichert. */
const numbered = (roles: readonly Role[]): Role[] => roles.map((r, i) => ({ ...r, position: i }));
/** Die Rollen ohne Supporter – egal, ob die Vorlage ihn schon mitbringt (Supporter-Branch). */
const withoutSupporter = (): Role[] => numbered(DEFAULT_ROLES.filter((r) => r.id !== 'supporter'));
/** Supporter wie in Philips Vorlage (✚, grün) zwischen Moderator und Builder – als Rolle, die im Panel dazukommt. */
const withSupporter = (): Role[] => {
  const roles = withoutSupporter();
  const after = roles.findIndex((r) => r.id === 'moderator') + 1;
  const supporter: Role = {
    id: 'supporter',
    name: { de: 'Supporter', en: 'Supporter' },
    symbol: '✚',
    colour: '#22c55e',
    panel: [],
    game: [],
    discord: [],
    position: after,
    fallback: false,
  };
  return numbered([...roles.slice(0, after), supporter, ...roles.slice(after)]);
};

type ChatLine = { text: { de: string; en: string } };

describe('Hub: Rang-Abzeichen', () => {
  let hub: Hub;
  let stores: Stores;
  let url: string;
  /** Hat das Netzwerk eine eigene Domain (sonst gibt es kein Paket)? */
  const domain = { on: true };
  const open: FakePlugin[] = [];

  beforeEach(async () => {
    const handle = openDatabase(':memory:');
    const events = createEventBus();
    stores = createStores(handle.db, events);
    domain.on = true;
    hub = createHub({
      secret: SECRET,
      db: handle.db,
      stores,
      events,
      log: quiet,
      timeZone: 'Europe/Berlin',
      badgePack: () => {
        if (!domain.on) return null;
        const pack = badgePackOf(stores.roles());
        return { url: `${URL_BASE}${pack.sha1}`, sha1: pack.sha1 };
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

  /** Proxy + Lobby, Philip (Owner, Deutsch) und Lena (Spielerin, Englisch). */
  const network = async (): Promise<{ proxy: FakePlugin; lobby: FakePlugin }> => {
    const proxy = await plugin('proxy', 'proxy');
    const lobby = await plugin('lobby', 'backend');
    hub.players.seen({ uuid: PHILIP, name: 'Philip', bedrock: false });
    hub.players.setRole(PHILIP, 'owner');
    await proxy.request({ t: 'login', uuid: PHILIP, name: 'Philip', locale: 'de_de', bedrock: false });
    proxy.send({ t: 'switch', uuid: PHILIP, server: 'lobby' });
    await proxy.request({ t: 'login', uuid: LENA, name: 'Lena', locale: 'en_us', bedrock: false });
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    await lobby.next('profile', (m) => m['uuid'] === PHILIP);
    await lobby.next('profile', (m) => m['uuid'] === LENA);
    return { proxy, lobby };
  };
  const roleOf = (m: Msg): Record<string, unknown> => m['role'] as Record<string, unknown>;

  test('an: Proxy bekommt Adresse und SHA-1, Profile tragen den Schlüssel, Chat wird zur Übersetzung', async () => {
    const proxy = await plugin('proxy', 'proxy');
    const offer = await proxy.next('badges');
    const sha1 = badgePackOf(stores.roles()).sha1;
    expect(offer).toMatchObject({ enabled: true, url: `${URL_BASE}${sha1}`, sha1, required: false });
    expect((offer['prompt'] as Record<string, string>)['de']).toContain('Rang-Abzeichen');
    open.splice(open.indexOf(proxy), 1);
    proxy.close();

    const { lobby } = await network();
    const profiles = lobby.received.filter((m) => m.t === 'profile');
    expect(roleOf(profiles.find((m) => m['uuid'] === PHILIP)!)).toMatchObject({ symbol: '♛', badge: '♛ ' });
    expect(roleOf(profiles.find((m) => m['uuid'] === LENA)!)).toMatchObject({ symbol: '', badge: '' });

    lobby.send({ t: 'chat', uuid: PHILIP, text: 'Servus' });
    const philip = (await lobby.next('chat')) as unknown as ChatLine;
    expect(philip.text.de).toBe(
      "<dark_gray>[</dark_gray><gray>Lobby</gray><dark_gray>]</dark_gray> <#ff5555><lang:'♛ '/></#ff5555><#ff5555>Philip</#ff5555> <dark_gray>»</dark_gray> <white>Servus",
    );
    lobby.send({ t: 'chat', uuid: LENA, text: 'Hi' });
    const lena = (await lobby.next('chat')) as unknown as ChatLine;
    expect(lena.text.en).toContain("<#aaaaaa><lang:''/></#aaaaaa><#aaaaaa>Lena</#aaaaaa>");
  });

  test('Gefängnis: Nachrichten aus der Zelle (nur ans Team) mit dem Gefängnis-Abzeichen', async () => {
    const { proxy, lobby } = await network();
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'gefaengnis', args: ['Lena', 'Test'] });
    await lobby.next('jail', (m) => (m['players'] as unknown[]).length === 1);
    lobby.send({ t: 'chat', uuid: LENA, text: 'lasst mich raus' });
    const toTeam = await proxy.next(
      'msg',
      (m) => m['uuid'] === PHILIP && String(m['text']).includes('lasst mich raus'),
    );
    expect(toTeam['text']).toBe(
      "<lang:'%1$s%2$s%3$s ':'<dark_gray>[':'<gray>⛓ Gefängnis':'<dark_gray>]'/><gray>Lena</gray> <dark_gray>»</dark_gray> <white>lasst mich raus",
    );
  });

  test('/abzeichen: Proxy schickt neu; Antworten in der Sprache des Spielers; ohne Nachfrage nur bei Problemen', async () => {
    const { proxy } = await network();
    const said = (uuid: string, part: string): Promise<Msg> =>
      proxy.next('msg', (m) => m['uuid'] === uuid && String(m['text']).includes(part));
    const status = (uuid: string, s: string): void => proxy.send({ t: 'badge-status', uuid, status: s });

    await proxy.request({ t: 'command', uuid: LENA, command: 'abzeichen', args: [] });
    expect(await proxy.next('badges-send')).toMatchObject({ uuid: LENA });
    status(LENA, 'sent');
    await said(LENA, 'on its way');
    status(LENA, 'loaded');
    await said(LENA, 'Badges are here');
    // Automatisch beim Betreten geladen: kein Wort (sonst stünde bei jedem Betreten eine Zeile im Chat).
    status(PHILIP, 'loaded');
    // Abgelehnt oder ging nicht: freundlicher Hinweis, auch ohne Nachfrage.
    status(PHILIP, 'declined');
    await said(PHILIP, '/abzeichen');
    status(PHILIP, 'failed');
    await said(PHILIP, 'nicht laden');
    // Alter Client (vor 1.20.3) auf Nachfrage.
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'abzeichen', args: [] });
    await proxy.next('badges-send', (m) => m['uuid'] === PHILIP);
    status(PHILIP, 'unsupported');
    await said(PHILIP, '1.20.3');
    expect(
      proxy.received.filter(
        (m) => m.t === 'msg' && m['uuid'] === PHILIP && String(m['text']).includes('da!'),
      ),
    ).toHaveLength(0);
  });

  test('Pflicht: wer ablehnt, fliegt freundlich hinaus – mit Erklärung, wie man das Paket einschaltet', async () => {
    const { proxy, lobby } = await network();
    // Im Spiel umgeschaltet (Owner sieht den Bereich „Rollen“) – genau wie im Panel.
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'netzwerk', args: ['paket', 'an'] });
    const required = await proxy.next('badges', (m) => m['required'] === true);
    expect(required).toMatchObject({ enabled: true });
    // Pflicht steht im Fenster, mit dem Minecraft fragt.
    expect((required['prompt'] as Record<string, string>)['de']).toContain('brauchst du');
    // Ein Spielserver darf das nicht melden (sonst könnte er Leute hinauswerfen).
    lobby.send({ t: 'badge-status', uuid: LENA, status: 'declined' });
    await new Promise((r) => setTimeout(r, 150));
    expect(proxy.received.some((m) => m.t === 'kick')).toBe(false);
    proxy.send({ t: 'badge-status', uuid: LENA, status: 'declined' });
    const kick = await proxy.next('kick', (m) => m['uuid'] === LENA);
    expect(kick['text']).toContain('Server Resource Packs: Enabled');
  });

  test('aus (Panel oder /abzeichen aus): Symbol wie bisher, Proxy nimmt das Paket ab', async () => {
    const { proxy, lobby } = await network();
    await proxy.request({ t: 'command', uuid: LENA, command: 'abzeichen', args: ['aus'] });
    await proxy.next('msg', (m) => m['uuid'] === LENA && String(m['text']).includes('not allowed'));
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'abzeichen', args: ['aus'] });
    expect(await proxy.next('badges', (m) => m['enabled'] === false)).toMatchObject({
      url: null,
      sha1: null,
    });
    const profile = await lobby.next('profile', (m) => m['uuid'] === PHILIP && roleOf(m)['badge'] === null);
    expect(roleOf(profile)).toMatchObject({ symbol: '♛' });
    lobby.send({ t: 'chat', uuid: PHILIP, text: 'Servus' });
    expect(((await lobby.next('chat')) as unknown as ChatLine).text.de).toContain(
      '<#ff5555>♛</#ff5555> <#ff5555>Philip</#ff5555>',
    );
    await proxy.request({ t: 'command', uuid: LENA, command: 'abzeichen', args: [] });
    await proxy.next('msg', (m) => m['uuid'] === LENA && String(m['text']).includes('switched off'));
  });

  test('ohne eigene Domain gibt es kein Paket – alles wie bisher', async () => {
    domain.on = false;
    const { proxy, lobby } = await network();
    expect(proxy.received.find((m) => m.t === 'badges')).toMatchObject({ enabled: false });
    expect(
      roleOf(lobby.received.find((m) => m.t === 'profile' && m['uuid'] === PHILIP)!)['badge'],
    ).toBeNull();
  });

  test('neue Rolle aus dem Panel (Supporter ✚, grün): neues Paket, Profil mit „✚ “', async () => {
    stores.saveRoles(withoutSupporter(), 'test', OWNER);
    const { proxy, lobby } = await network();
    const before = (await proxy.next('badges'))['sha1'];
    expect(before).toBe(badgePackOf(withoutSupporter()).sha1);
    stores.saveRoles(withSupporter(), 'test', OWNER);
    const after = await proxy.next('badges', (m) => m['sha1'] !== before);
    expect(after['sha1']).toBe(badgePackOf(withSupporter()).sha1);
    hub.players.setRole(LENA, 'supporter');
    hub.refreshProfile(LENA);
    const profile = await lobby.next('profile', (m) => m['uuid'] === LENA && roleOf(m)['id'] === 'supporter');
    expect(roleOf(profile)).toMatchObject({ symbol: '✚', colour: '#22c55e', badge: '✚ ' });
  });
});
