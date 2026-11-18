import fs from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { DEFAULT_MODES, resetConfirmOk, type ResetOverview } from '@moinmorni/shared';
import { modeStats } from '../src/db/schema.js';
import { readServerFile, writeServerFile } from '../src/motor/files.js';
import { createProvisioner } from '../src/network/provision.js';
import { resetPaths } from '../src/network/reset.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';
import { until } from './wait.js';

const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const SETUP_MS = 120_000;
const RUN_MS = 90_000;
const POLL_MS = 500;
const WINS = 3;
const JUMP = 9;
const UUID = '11111111-2222-3333-4444-555555555555';

type Session = { cookie: string; csrf: string };

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;

describe('Zurücksetzen: welche Pfade', () => {
  const plugins = [
    { dir: 'MoinMorniDuels', entries: ['config.yml', 'spieler', 'rangliste.yml', 'bau.yml'] },
    {
      dir: 'moinmorni',
      entries: ['hub.json', 'jumpandrun.yml', 'lobby-world.version', 'mode-settings.json'],
    },
    { dir: '..', entries: ['spieler'] },
  ];
  test('Welt: Weltordner und Bau-Merker, keine Konfiguration', () => {
    expect(resetPaths({ what: 'world', worlds: ['world', 'world_nether'], plugins }).sort()).toEqual(
      [
        'plugins/MoinMorniDuels/bau.yml',
        'plugins/moinmorni/lobby-world.version',
        'world',
        'world_nether',
      ].sort(),
    );
  });
  test('Spielstand: Spielerdaten und Bestenlisten, Welt bleibt', () => {
    expect(resetPaths({ what: 'progress', worlds: ['world'], plugins }).sort()).toEqual(
      [
        'plugins/MoinMorniDuels/rangliste.yml',
        'plugins/MoinMorniDuels/spieler',
        'plugins/moinmorni/jumpandrun.yml',
        'world/advancements',
        'world/playerdata',
        'world/stats',
      ].sort(),
    );
  });
  test('Beides; nie „..“ oder Schrägstriche', () => {
    const all = resetPaths({ what: 'both', worlds: ['world', '..', 'a/b'], plugins });
    expect(all).toContain('world');
    expect(all).toContain('plugins/MoinMorniDuels/spieler');
    expect(all.some((p) => p.includes('..') || p.startsWith('a/'))).toBe(false);
    expect(all.some((p) => p.endsWith('config.yml') || p.endsWith('hub.json'))).toBe(false);
  });
  test('Bestätigung: Name des Servers bzw. ALLE', () => {
    const one = [{ name: { de: 'Bau-Server', en: 'Build server' } }];
    expect(resetConfirmOk('bau-server', one)).toBe(true);
    expect(resetConfirmOk('Build server', one)).toBe(true);
    expect(resetConfirmOk('ALLE', one)).toBe(false);
    expect(resetConfirmOk('alle', [...one, ...one])).toBe(true);
    expect(resetConfirmOk('Bau-Server', [...one, ...one])).toBe(false);
  });
});

describe('Panel → „Server zurücksetzen“ (echter Motor)', () => {
  let h: Harness;
  let owner: Session;
  const call = (method: 'GET' | 'POST', url: string, session?: Session, payload?: object) =>
    h.mm.app.inject({
      method,
      url,
      payload,
      headers: session ? { cookie: session.cookie, 'x-csrf-token': session.csrf } : {},
    });
  const overview = async (): Promise<ResetOverview> => {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const res = await call('GET', '/api/panel/servers/reset', owner);
    expect(res.statusCode, res.body).toBe(OK);
    return res.json<ResetOverview>();
  };
  const serverId = async (part: string): Promise<string> => {
    const all = await h.mm.motor.request<Array<{ id: string; name: string }>>('GET', '/api/servers');
    return all.find((s) => s.name.toLowerCase().includes(part))!.id;
  };

  beforeAll(async () => {
    h = await createHarness();
    owner = await h.login('philip', OWNER_PASSWORD);
    const jar = path.join(h.mmDir, 'MoinMorni-Network.jar');
    fs.writeFileSync(jar, 'plugin-v1');
    await createProvisioner({ ...h.mm.config, pluginFile: jar }, h.mm.motor, h.mm.hub, quiet, {
      proxyAddOns: {},
      lobbyAddOns: {},
      buildContent: false,
      versions: { paper: '1.21.4', velocity: '3.4.0' },
      modes: () => DEFAULT_MODES,
      releases: {
        latest: async (repo) =>
          repo.endsWith('MoinMorni-Duels')
            ? { repo, tag: 'v1.0.0', fileName: 'MoinMorni-Duels.jar', bytes: Buffer.from('duels') }
            : null,
      },
    }).ensure();
  }, SETUP_MS);
  afterAll(async () => {
    await h.cleanup();
  });

  test('Liste mit Wartungs-Lobby, ohne Proxy; nur der Owner', async () => {
    expect((await call('GET', '/api/panel/servers/reset')).statusCode).toBe(UNAUTHORIZED);
    const view = await overview();
    const members = view.servers.map((s) => s.member);
    expect(members.slice(0, WINS)).toEqual(['lobby', 'wartung', 'bau']);
    expect(members).toContain('duels');
    expect(members).not.toContain('proxy');
    const made = await call('POST', '/api/panel/team', owner, { username: 'anna', roleId: 'admin' });
    const anna = await h.login('anna', made.json<{ password: string }>().password);
    expect((await call('GET', '/api/panel/servers/reset', anna)).statusCode).toBe(FORBIDDEN);
    expect(
      (
        await call('POST', '/api/panel/servers/reset', anna, {
          servers: ['bau'],
          what: 'world',
          confirm: 'Bau-Server',
        })
      ).statusCode,
    ).toBe(FORBIDDEN);
  });

  test('Falsche Bestätigung und unbekannte Server werden abgelehnt', async () => {
    const wrong = await call('POST', '/api/panel/servers/reset', owner, {
      servers: ['bau'],
      what: 'world',
      confirm: 'Lobby',
    });
    expect(wrong.statusCode).toBe(BAD_REQUEST);
    expect(wrong.json<{ error: string }>().error).toBe('reset_confirm');
    const unknown = await call('POST', '/api/panel/servers/reset', owner, {
      servers: ['proxy'],
      what: 'world',
      confirm: 'Proxy',
    });
    expect(unknown.statusCode).toBe(BAD_REQUEST);
  });

  test(
    'Spielstand von Duels: Sicherung, Spielerdaten und Statistik weg, Konfiguration und Welt bleiben',
    async () => {
      const id = await serverId('duels');
      await until(
        async () => (await overview()).servers.find((s) => s.member === 'duels')?.running === true,
        RUN_MS,
      );
      await writeServerFile(h.mm.motor, id, 'world/level.dat', 'x');
      await writeServerFile(h.mm.motor, id, 'world/playerdata/a.dat', 'x');
      await writeServerFile(h.mm.motor, id, 'plugins/MoinMorniDuels/config.yml', 'zeit: 5\n');
      await writeServerFile(h.mm.motor, id, 'plugins/MoinMorniDuels/spieler/a.yml', 'siege: 3\n');
      h.mm.db.insert(modeStats).values({ mode: 'duels', uuid: UUID, key: 'wins', value: WINS }).run();
      h.mm.db.insert(modeStats).values({ mode: 'lobby', uuid: UUID, key: 'jump_best', value: JUMP }).run();
      const res = await call('POST', '/api/panel/servers/reset', owner, {
        servers: ['duels'],
        what: 'progress',
        confirm: 'duels',
      });
      expect(res.statusCode, res.body).toBe(OK);
      await until(
        async () => (await overview()).progress.servers.find((s) => s.member === 'duels')?.step === 'done',
        RUN_MS,
      );
      const backups = await h.mm.motor.request<{ backups: Array<{ status: string }> }>(
        'GET',
        `/api/servers/${id}/backups`,
      );
      expect(backups.backups.some((b) => b.status === 'done')).toBe(true);
      expect(await readServerFile(h.mm.motor, id, 'plugins/MoinMorniDuels/spieler/a.yml')).toBeNull();
      expect(await readServerFile(h.mm.motor, id, 'world/playerdata/a.dat')).toBeNull();
      expect(await readServerFile(h.mm.motor, id, 'plugins/MoinMorniDuels/config.yml')).toBe('zeit: 5\n');
      expect(await readServerFile(h.mm.motor, id, 'world/level.dat')).toBe('x');
      expect(h.mm.db.select().from(modeStats).where(eq(modeStats.mode, 'duels')).all()).toEqual([]);
      expect(
        h.mm.db
          .select()
          .from(modeStats)
          .where(and(eq(modeStats.mode, 'lobby'), eq(modeStats.uuid, UUID)))
          .all(),
      ).toHaveLength(1);
      await until(
        async () => (await overview()).servers.find((s) => s.member === 'duels')?.running === true,
        RUN_MS,
      );
    },
    RUN_MS * WINS,
  );

  test(
    'Welt des Bau-Servers: Weltordner weg, Server läuft danach wieder',
    async () => {
      await until(async () => !(await overview()).progress.running, RUN_MS);
      const id = await serverId('bau');
      await until(
        async () => (await overview()).servers.find((s) => s.member === 'bau')?.running === true,
        RUN_MS,
      );
      await writeServerFile(h.mm.motor, id, 'world/level.dat', 'x');
      await writeServerFile(h.mm.motor, id, 'world/region/r.0.0.mca', 'x');
      const res = await call('POST', '/api/panel/servers/reset', owner, {
        servers: ['bau'],
        what: 'world',
        confirm: 'Bau-Server',
      });
      expect(res.statusCode, res.body).toBe(OK);
      await until(
        async () => (await overview()).progress.servers.find((s) => s.member === 'bau')?.step === 'done',
        RUN_MS,
      );
      // Der nachgebaute Server legt beim Start eine frische Welt an – unsere Datei ist weg.
      expect(await readServerFile(h.mm.motor, id, 'world/region/r.0.0.mca')).not.toBe('x');
      expect(await readServerFile(h.mm.motor, id, 'server.properties')).not.toBeNull();
      await until(
        async () => (await overview()).servers.find((s) => s.member === 'bau')?.running === true,
        RUN_MS,
      );
    },
    RUN_MS * WINS,
  );
});
