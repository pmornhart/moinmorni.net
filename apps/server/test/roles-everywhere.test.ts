/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import type { FastifyBaseLogger } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { alwaysIn, DEFAULT_ROLES } from '@moinmorni/shared';
import { openDatabase, type Db } from '../src/db/index.js';
import { teamMembers } from '../src/db/schema.js';
import { createHub, type Hub } from '../src/hub/index.js';
import { createEventBus } from '../src/lib/events.js';
import { createApplicationService, type ApplicationService } from '../src/mornicraft/applications.js';
import { teamOnWhitelist } from '../src/mornicraft/team.js';
import { createStores, type Stores } from '../src/panel/stores.js';
import { connectPlugin, type FakePlugin, type Msg } from './fake-plugin.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';

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
const ANNA = '22222222-2222-2222-2222-222222222222';
const SUSI = '33333333-3333-3333-3333-333333333333';
const BEN = '44444444-4444-4444-4444-444444444444';
const VERA = '55555555-5555-5555-5555-555555555555';
const LENA = '66666666-6666-6666-6666-666666666666';
/** Team-Konto mit verbundenem Minecraft-Konto, war noch nie im Netzwerk. */
const MORITZ = '77777777-7777-7777-7777-777777777777';

const PEOPLE: ReadonlyArray<readonly [string, string, string | null]> = [
  [PHILIP, 'Philip', 'owner'],
  [ANNA, 'Anna', 'admin'],
  [SUSI, 'Susi', 'supporter'],
  [BEN, 'Ben', 'builder'],
  [VERA, 'Vera', 'vip'],
  [LENA, 'Lena', null],
];

describe('Ränge überall: Supporter, Rechte im Spiel, wer immer hineinkommt', () => {
  let db: Db;
  let stores: Stores;
  let hub: Hub;
  let applications: ApplicationService;
  let url: string;
  const open: FakePlugin[] = [];

  beforeEach(async () => {
    db = openDatabase(':memory:').db;
    const events = createEventBus();
    stores = createStores(db, events);
    applications = createApplicationService(db, stores, events);
    hub = createHub({
      secret: SECRET,
      db,
      stores,
      events,
      log: quiet,
      timeZone: 'Europe/Berlin',
      allowedIn: applications.allowed,
    });
    url = `ws://127.0.0.1:${await hub.listen('127.0.0.1', 0)}/hub`;
    PEOPLE.forEach(([uuid, name, role]) => {
      hub.players.seen({ uuid, name, bedrock: false });
      hub.players.setRole(uuid, role);
    });
    db.insert(teamMembers)
      .values({ motorUserId: 7, username: 'moritz.mod', roleId: 'moderator', minecraftUuid: MORITZ })
      .run();
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
  const login = (proxy: FakePlugin, uuid: string, name: string): Promise<Msg> =>
    proxy.request({ t: 'login', uuid, name, locale: 'de_de', bedrock: false });

  test('Supporter: verwarnen und stummschalten ja – bannen, einsperren, rauswerfen nein', async () => {
    const proxy = await plugin('proxy', 'proxy');
    await plugin('lobby', 'backend');
    await login(proxy, SUSI, 'Susi');
    await login(proxy, LENA, 'Lena');
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });

    const said = (part: string) =>
      proxy.next('msg', (m) => m['uuid'] === SUSI && String(m['text']).includes(part));
    await ['ban', 'gefaengnis', 'kick'].reduce(async (before, command) => {
      await before;
      await proxy.request({ t: 'command', uuid: SUSI, command, args: ['Lena', 'Test'] });
      await said('Das darfst du leider nicht');
    }, Promise.resolve());
    await proxy.request({ t: 'command', uuid: SUSI, command: 'warn', args: ['Lena', 'Bitte', 'freundlich'] });
    await proxy.request({ t: 'command', uuid: SUSI, command: 'mute', args: ['Lena', '10m', 'Spam'] });
    expect(hub.punish.history(LENA).map((p) => p.kind)).toEqual(expect.arrayContaining(['warn', 'mute']));
    expect(hub.punish.active(LENA, 'mute')).toBeTruthy();
    expect(hub.punish.active(LENA, 'ban')).toBeFalsy();
    expect(hub.punish.active(LENA, 'jail')).toBeFalsy();
    // Höhere Ränge kann ein Supporter nicht bestrafen.
    await login(proxy, ANNA, 'Anna');
    await proxy.request({ t: 'command', uuid: SUSI, command: 'mute', args: ['Anna'] });
    await said('höherer Rang');
  });

  test('Rechte im Spiel kommen mit dem Profil und ändern sich sofort mit dem Rang', async () => {
    const proxy = await plugin('proxy', 'proxy');
    const lobby = await plugin('lobby', 'backend');
    await login(proxy, PHILIP, 'Philip');
    await login(proxy, SUSI, 'Susi');
    proxy.send({ t: 'switch', uuid: SUSI, server: 'lobby' });
    const profileOf = (role: string) =>
      lobby.next('profile', (m) => m['uuid'] === SUSI && (m['role'] as { id: string }).id === role);
    const supporter = await profileOf('supporter');
    expect(supporter['rights']).toEqual(DEFAULT_ROLES.find((r) => r.id === 'supporter')?.game);
    expect(supporter['rights']).not.toContain('modes-admin');
    expect(supporter['role']).toMatchObject({ symbol: '✚', colour: '#22c55e', position: 3 });

    await proxy.request({ t: 'command', uuid: PHILIP, command: 'rang', args: ['Susi', 'admin'] });
    expect((await profileOf('admin'))['rights']).toEqual(expect.arrayContaining(['modes-admin', 'creative']));
    await proxy.request({ t: 'command', uuid: PHILIP, command: 'rang', args: ['Susi', 'supporter'] });
    expect((await profileOf('supporter'))['rights']).not.toContain('modes-admin');
  });

  test('die Whitelist zeigt genau, wer über den Rang immer hineinkommt', async () => {
    const proxy = await plugin('proxy', 'proxy');
    await plugin('mornicraft', 'backend');
    stores.patchMode('mornicraft', { state: 'on' }, 'test');
    const people = [...PEOPLE.map(([uuid, name]) => [uuid, name] as const), [MORITZ, 'Moritz'] as const];
    const admitted = async (): Promise<string[]> => {
      const allowed = await Promise.all(
        people.map(async ([uuid, name]) => {
          await login(proxy, uuid, name);
          const r = await proxy.request({ t: 'connecting', uuid, server: 'mornicraft' });
          return (r['data'] as { allow: boolean }).allow ? uuid : null;
        }),
      );
      return allowed.filter((u): u is string => u !== null).sort();
    };

    const team = teamOnWhitelist(db, hub.players, applications.whitelist());
    // Owner, Admin, Supporter und das Team-Konto (Moderator); Builder, VIP und Spieler nicht.
    expect(team.map((t) => [t.name, t.role.id, t.seen, t.listed])).toEqual([
      ['Philip', 'owner', true, null],
      ['Anna', 'admin', true, null],
      ['moritz.mod', 'moderator', false, null],
      ['Susi', 'supporter', true, null],
    ]);
    expect(team.every((t) => alwaysIn(hub.players.roleOf(t.uuid)))).toBe(true);
    expect(await admitted()).toEqual(team.map((t) => t.uuid).sort());

    // Von Hand eingetragen: Lena kommt dazu; Susi steht zusätzlich drauf – im Team nur einmal, mit Verweis.
    const lena = applications.allow('Lena', 'test');
    const susi = applications.allow('Susi', 'test');
    const listed = teamOnWhitelist(db, hub.players, applications.whitelist());
    expect(listed.find((t) => t.uuid === SUSI)?.listed).toBe(susi.id);
    expect(listed.map((t) => t.listed)).not.toContain(lena.id);
    expect(await admitted()).toEqual([...team.map((t) => t.uuid), LENA].sort());
  });
});

describe('Whitelist im Panel mit Team (echter Motor)', () => {
  let h: Harness;
  let owner: { cookie: string; csrf: string };
  const get = (url: string, session?: { cookie: string; csrf: string }) =>
    h.mm.app.inject({ method: 'GET', url, headers: session ? { cookie: session.cookie } : {} });

  beforeAll(async () => {
    h = await createHarness();
    owner = await h.login('philip', OWNER_PASSWORD);
  }, 60_000);
  afterAll(async () => {
    await h.cleanup();
  });

  test('GET /api/panel/whitelist/team: Team mit Rang, Symbol und Farbe – nur mit Bereich „Spieler“', async () => {
    expect((await get('/api/panel/whitelist/team')).statusCode).toBe(401);
    PEOPLE.forEach(([uuid, name, role]) => {
      h.mm.hub.players.seen({ uuid, name, bedrock: false });
      h.mm.hub.players.setRole(uuid, role);
    });
    const res = await get('/api/panel/whitelist/team', owner);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      expect.objectContaining({
        name: 'Philip',
        role: expect.objectContaining({ id: 'owner', symbol: '♛' }),
      }),
      expect.objectContaining({ name: 'Anna', role: expect.objectContaining({ id: 'admin' }) }),
      expect.objectContaining({
        name: 'Susi',
        seen: true,
        listed: null,
        role: {
          id: 'supporter',
          name: { de: 'Supporter', en: 'Supporter' },
          symbol: '✚',
          colour: '#22c55e',
          position: 3,
        },
      }),
    ]);
  });
});
