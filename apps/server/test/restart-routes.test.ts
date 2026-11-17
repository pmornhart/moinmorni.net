import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { DEFAULT_MODES, type RestartOverview, type RestartRequestResult } from '@moinmorni/shared';
import { createProvisioner } from '../src/network/provision.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';
import { until } from './wait.js';

const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
/** Der echte Provisioner legt die Server im nachgebauten Docker an. */
const SETUP_MS = 120_000;
const RUN_MS = 60_000;
const POLL_MS = 500;

type Session = { cookie: string; csrf: string };

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;

describe('Panel → „Server neu starten“', () => {
  let h: Harness;
  let owner: Session;
  const call = (method: 'GET' | 'POST', url: string, session?: Session, payload?: object) =>
    h.mm.app.inject({
      method,
      url,
      payload,
      headers: session ? { cookie: session.cookie, 'x-csrf-token': session.csrf } : {},
    });
  /** Wie das Panel: höchstens alle halbe Sekunde nachfragen. */
  const overview = async (): Promise<RestartOverview> => {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const res = await call('GET', '/api/panel/servers/restart', owner);
    expect(res.statusCode, res.body).toBe(OK);
    return res.json<RestartOverview>();
  };

  beforeAll(async () => {
    h = await createHarness();
    owner = await h.login('philip', OWNER_PASSWORD);
    const jar = path.join(h.mmDir, 'MoinMorni-Network.jar');
    fs.writeFileSync(jar, 'plugin-v1');
    // Proxy, Lobby, Wartungs-Lobby, Bau-Server und Duels mit dem echten Provisioner.
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

  test('Liste: Proxy, Lobby, Bau-Server und Modi – die Wartungs-Lobby nie', async () => {
    const res = await call('GET', '/api/panel/servers/restart', owner);
    expect(res.statusCode).toBe(OK);
    const view = res.json<RestartOverview>();
    const members = view.servers.map((s) => s.member);
    expect(members.slice(0, 3)).toEqual(['proxy', 'lobby', 'bau']);
    expect(members).toContain('duels');
    expect(members).not.toContain('wartung');
    expect(view.servers.find((s) => s.member === 'duels')).toMatchObject({
      kind: 'mode',
      modeId: 'duels',
      name: { de: 'Duels', en: 'Duels' },
    });
    expect(view.countdown).toBe(30);
  });

  test('Wartungs-Lobby wird abgelehnt – auch zusammen mit anderen', async () => {
    const answers = await Promise.all(
      [['wartung'], ['duels', 'wartung']].map((servers) =>
        call('POST', '/api/panel/servers/restart', owner, { servers }),
      ),
    );
    answers.forEach((res) => {
      expect(res.statusCode).toBe(BAD_REQUEST);
      expect(res.json<{ error: string }>().error).toBe('restart_wartung');
    });
    const unknown = await call('POST', '/api/panel/servers/restart', owner, { servers: ['gibtsnicht'] });
    expect(unknown.statusCode).toBe(BAD_REQUEST);
  });

  test('Ohne Anmeldung 401, ohne Bereich „Server“ 403', async () => {
    expect((await call('GET', '/api/panel/servers/restart')).statusCode).toBe(UNAUTHORIZED);
    const made = await call('POST', '/api/panel/team', owner, { username: 'lena', roleId: 'moderator' });
    const lena = await h.login('lena', made.json<{ password: string }>().password);
    expect((await call('GET', '/api/panel/servers/restart', lena)).statusCode).toBe(FORBIDDEN);
    expect((await call('POST', '/api/panel/servers/restart', lena, { servers: ['duels'] })).statusCode).toBe(
      FORBIDDEN,
    );
  });

  test(
    'Owner startet einen laufenden Server neu; der Fortschritt steht im Panel',
    async () => {
      await until(
        async () => (await overview()).servers.find((s) => s.member === 'bau')?.state === 'running',
        RUN_MS,
      );
      const res = await call('POST', '/api/panel/servers/restart', owner, { servers: ['bau'] });
      expect(res.statusCode).toBe(OK);
      expect(res.json<RestartRequestResult>()).toEqual({ started: ['bau'], skipped: [], queued: false });
      expect((await overview()).progress.servers).toContainEqual(expect.objectContaining({ member: 'bau' }));
      await until(
        async () => (await overview()).progress.servers.find((s) => s.member === 'bau')?.step === 'done',
        RUN_MS,
      );
    },
    RUN_MS * 2,
  );
});
