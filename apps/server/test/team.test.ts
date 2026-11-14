import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createProvisioner } from '../src/network/provision.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';

interface Member {
  readonly id: number;
  readonly username: string;
  readonly roleId: string;
  readonly mustChangePassword: boolean;
  readonly disabled: boolean;
  readonly self: boolean;
  readonly manageable: boolean;
}
type Session = { cookie: string; csrf: string };

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;
// Startpasswort: drei Viererblöcke, z. B. "abcd-EFGH-2345".
// https://regex101.com/?flavor=javascript&regex=%5E%5B%5Cw%5D%7B4%7D-%5B%5Cw%5D%7B4%7D-%5B%5Cw%5D%7B4%7D%24&testString=abcd-EFGH-2345
const START_PASSWORD = /^\w{4}-\w{4}-\w{4}$/;

describe('Team-Konten', () => {
  let h: Harness;
  let owner: Session;
  const call = (method: string, url: string, session?: Session, payload?: object) =>
    h.mm.app.inject({
      method: method as 'GET',
      url,
      payload,
      headers: session ? { cookie: session.cookie, 'x-csrf-token': session.csrf } : {},
    });
  const team = async (session: Session): Promise<Member[]> =>
    (await call('GET', '/api/panel/team', session)).json<Member[]>();
  const motorUser = async (username: string) =>
    (
      await h.mm.motor.request<
        Array<{ username: string; access: Array<{ serverId: string; roleId: number }> }>
      >('GET', '/api/users')
    ).find((u) => u.username === username);

  beforeAll(async () => {
    h = await createHarness();
    owner = await h.login('philip', OWNER_PASSWORD);
    // Zwei Server im Motor, damit der Zugriff auf die Server-Seiten geprüft werden kann.
    const jar = path.join(h.mmDir, 'MoinMorni-Network.jar');
    fs.writeFileSync(jar, 'plugin');
    await createProvisioner({ ...h.mm.config, pluginFile: jar }, h.mm.motor, h.mm.hub, quiet, {
      proxyAddOns: {},
      lobbyAddOns: {},
      versions: { paper: '1.21.4', velocity: '3.4.0' },
    }).ensure();
  }, 60_000);
  afterAll(async () => {
    await h.cleanup();
  });

  test('Owner legt ein Konto an: Startpasswort, muss beim Anmelden ein eigenes setzen, sieht nur seine Bereiche', async () => {
    const res = await call('POST', '/api/panel/team', owner, { username: 'lena', roleId: 'moderator' });
    expect(res.statusCode).toBe(200);
    const { password } = res.json<{ password: string }>();
    expect(password).toMatch(START_PASSWORD);
    const lena = (await team(owner)).find((m) => m.username === 'lena');
    expect(lena).toMatchObject({ roleId: 'moderator', mustChangePassword: true, manageable: true });
    expect((await team(owner)).find((m) => m.username === 'philip')).toMatchObject({
      self: true,
      manageable: false,
    });

    const session = await h.login('lena', password);
    const me = (await call('GET', '/api/panel/me', session)).json<{
      role: { id: string };
      areas: string[];
    }>();
    expect(me.role.id).toBe('moderator');
    expect(me.areas).toContain('players');
    expect((await call('GET', '/api/panel/team', session)).statusCode).toBe(403);

    // Gleicher Name, Rolle ohne Panel und Spieler-Rang gehen nicht.
    expect(
      (await call('POST', '/api/panel/team', owner, { username: 'lena', roleId: 'moderator' })).json(),
    ).toEqual({
      error: 'username_taken',
    });
    expect(
      (await call('POST', '/api/panel/team', owner, { username: 'vipper', roleId: 'vip' })).json(),
    ).toEqual({ error: 'team_role_no_panel' });
    expect(
      (await call('POST', '/api/panel/team', owner, { username: 'spieler1', roleId: 'player' })).json(),
    ).toEqual({ error: 'team_role_fallback' });
  });

  test('Server-Zugriff im Motor nach Rolle: Admin als Besitzer, Moderator ohne Server-Bereich keinen', async () => {
    const res = await call('POST', '/api/panel/team', owner, { username: 'max', roleId: 'admin' });
    const max = await motorUser('max');
    expect(max?.access).toHaveLength(2);
    expect((await motorUser('lena'))?.access).toEqual([]);

    // Admin darf keine Admins/Owner anlegen und den Owner nicht anfassen, Moderatoren schon.
    const session = await h.login('max', res.json<{ password: string }>().password);
    expect(
      (await call('POST', '/api/panel/team', session, { username: 'zweit', roleId: 'admin' })).json(),
    ).toEqual({
      error: 'team_higher',
    });
    const philip = (await team(session)).find((m) => m.username === 'philip');
    expect(philip?.manageable).toBe(false);
    expect(
      (await call('PATCH', `/api/panel/team/${philip?.id}`, session, { roleId: 'moderator' })).statusCode,
    ).toBe(403);
    const lena = (await team(session)).find((m) => m.username === 'lena');
    expect(
      (await call('PATCH', `/api/panel/team/${lena?.id}`, session, { roleId: 'builder' })).statusCode,
    ).toBe(200);
    expect((await team(owner)).find((m) => m.username === 'lena')?.roleId).toBe('builder');
  });

  test('Passwort zurücksetzen, sperren, entfernen; sich selbst nicht', async () => {
    const lena = (await team(owner)).find((m) => m.username === 'lena');
    const reset = await call('POST', `/api/panel/team/${lena?.id}/reset-password`, owner, {});
    const { password } = reset.json<{ password: string }>();
    expect((await h.login('lena', password)).cookie).not.toBe('');

    expect(
      (await call('PUT', `/api/panel/team/${lena?.id}/disabled`, owner, { disabled: true })).statusCode,
    ).toBe(200);
    expect((await team(owner)).find((m) => m.username === 'lena')?.disabled).toBe(true);
    const blocked = await fetch(`${h.mmUrl}/panel/motor/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: h.mmUrl },
      body: JSON.stringify({ username: 'lena', password }),
    });
    expect(blocked.ok).toBe(false);

    const me = (await team(owner)).find((m) => m.self);
    expect((await call('DELETE', `/api/panel/team/${me?.id}`, owner)).json()).toEqual({
      error: 'team_not_self',
    });
    expect((await call('DELETE', `/api/panel/team/${lena?.id}`, owner)).statusCode).toBe(200);
    expect((await team(owner)).some((m) => m.username === 'lena')).toBe(false);
    expect(await motorUser('lena')).toBeUndefined();
  });
});
