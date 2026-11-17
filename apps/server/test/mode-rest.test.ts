import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { DEFAULT_MODES, modeIdleOf, type ModeRest } from '@moinmorni/shared';
import { createProvisioner } from '../src/network/provision.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';

const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
/** Der echte Provisioner legt vier Server im nachgebauten Docker an. */
const SETUP_MS = 120_000;

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;

describe('Ruhezustand je Modus im Panel (Modi → „Wenn niemand drin ist“)', () => {
  let h: Harness;
  let owner: { cookie: string; csrf: string };
  let duelsId = '';
  const call = (method: 'GET' | 'PUT', url: string, payload?: object) =>
    h.mm.app.inject({
      method,
      url,
      payload,
      headers: { cookie: owner.cookie, 'x-csrf-token': owner.csrf },
    });
  const idleOf = async (id: string): Promise<boolean | undefined> =>
    (await h.mm.motor.request<{ releaseIdleMemory?: boolean }>('GET', `/api/servers/${id}`))
      .releaseIdleMemory;

  beforeAll(async () => {
    h = await createHarness();
    owner = await h.login('philip', OWNER_PASSWORD);
    const jar = path.join(h.mmDir, 'MoinMorni-Network.jar');
    fs.writeFileSync(jar, 'plugin-v1');
    // Netzwerk mit dem echten Provisioner: Proxy, Lobby, Bau-Server und Duels (nur Duels hat ein Release).
    const provisioner = createProvisioner({ ...h.mm.config, pluginFile: jar }, h.mm.motor, h.mm.hub, quiet, {
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
    });
    await provisioner.ensure();
    const nets = await h.mm.motor.request<
      Array<{ name: string; members: Array<{ name: string; serverId: string }> }>
    >('GET', '/api/networks');
    duelsId =
      nets.find((n) => n.name === 'MoinMorni')?.members.find((m) => m.name === 'duels')?.serverId ?? '';
  }, SETUP_MS);
  afterAll(async () => {
    await h.cleanup();
  });

  test('zeigt je Modus, was der Motor sagt – ohne Server nichts', async () => {
    const res = await call('GET', '/api/panel/modes/rest');
    expect(res.statusCode).toBe(OK);
    const rest = res.json<Record<string, ModeRest>>();
    // Neue Server legt das Netzwerk im Ruhezustand an.
    expect(rest['duels']).toEqual({ on: true, restartPending: false });
    expect(rest['party']).toEqual({ on: null, restartPending: false });
    expect(Object.keys(rest).sort()).toEqual(DEFAULT_MODES.map((m) => m.id).sort());
  });

  test('Wach bleiben schaltet den Ruhezustand im Motor aus, Ruhezustand wieder an', async () => {
    expect(await idleOf(duelsId)).toBe(true);
    const off = await call('PUT', '/api/panel/modes/duels/rest', { on: false });
    expect(off.statusCode).toBe(OK);
    expect(off.json<ModeRest>().on).toBe(false);
    expect(await idleOf(duelsId)).toBe(false);
    expect((await call('GET', '/api/panel/modes/rest')).json<Record<string, ModeRest>>()['duels']?.on).toBe(
      false,
    );

    const on = await call('PUT', '/api/panel/modes/duels/rest', { on: true });
    expect(on.json<ModeRest>().on).toBe(true);
    expect(await idleOf(duelsId)).toBe(true);
  });

  test('ohne Server, unbekannter Modus, falsche Eingabe, ohne Anmeldung', async () => {
    expect((await call('PUT', '/api/panel/modes/party/rest', { on: false })).json()).toMatchObject({
      error: 'mode_no_server',
    });
    expect((await call('PUT', '/api/panel/modes/gibtsnicht/rest', { on: false })).statusCode).toBe(NOT_FOUND);
    expect((await call('PUT', '/api/panel/modes/duels/rest', { on: 'nein' })).statusCode).toBe(BAD_REQUEST);
    const anon = await h.mm.app.inject({ method: 'GET', url: '/api/panel/modes/rest' });
    expect(anon.statusCode).toBe(UNAUTHORIZED);
  });

  test('was die Modi-Seite daraus macht', () => {
    expect(modeIdleOf(false, true)).toBe('rest');
    expect(modeIdleOf(false, null)).toBe('rest');
    expect(modeIdleOf(false, false)).toBe('awake');
    expect(modeIdleOf(true, false)).toBe('sleep');
    expect(modeIdleOf(true, true)).toBe('sleep');
  });
});
