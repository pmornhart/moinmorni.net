/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Mode, NetworkStatus } from '@moinmorni/shared';
import { motorPathAllowed } from '../src/motor/proxy.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';

describe('Weiterleitung an den Motor', () => {
  test.each([
    ['/api/auth/login', true],
    ['/api/auth/me', true],
    ['/api/servers/abc/files', true],
    ['/api/ws', true],
    ['/api/netbird', true],
    ['/api/auth/register', false],
    ['/api/setup', false],
    ['/api/signup', false],
    ['/api/tokens', false],
    ['/api/payments', false],
    ['/api/approvals', false],
    ['/api/transfer/export', false],
    ['/api/servers/../setup', false],
    ['/api/game-art/java', false],
    ['/api/item-icons/item/diamond', false],
  ])('%s → %s', (path, allowed) => {
    expect(motorPathAllowed(path)).toBe(allowed);
  });
});

describe('MoinMorni mit echtem Motor (MorniHosting, nachgebautes Docker)', () => {
  let h: Harness;
  let owner: { cookie: string; csrf: string };
  const call = (
    method: 'GET' | 'PUT' | 'PATCH',
    url: string,
    session?: { cookie: string; csrf: string },
    payload?: object,
  ) =>
    h.mm.app.inject({
      method,
      url,
      payload,
      headers: session ? { cookie: session.cookie, 'x-csrf-token': session.csrf } : {},
    });

  beforeAll(async () => {
    h = await createHarness();
    owner = await h.login('philip', OWNER_PASSWORD);
  }, 60_000);
  afterAll(async () => {
    await h.cleanup();
  });

  test('der öffentliche Status zeigt alle Modi, auch ohne laufendes Netzwerk', async () => {
    const status = (await call('GET', '/api/status')).json<NetworkStatus>();
    expect(status.online).toBe(false);
    expect(status.javaAddress).toBe('moinmorni.net');
    expect(status.modes.map((m) => m.id)).toEqual([
      'mornicraft',
      'duels',
      'party',
      'gipfelsturm',
      'burgverlies',
      'bollwerk',
      'mirni',
    ]);
  });

  test('Anmelden läuft über den Motor; das erste Admin-Konto wird Owner', async () => {
    expect(owner.cookie.startsWith('mh_session=')).toBe(true);
    expect((await call('GET', '/api/panel/me')).statusCode).toBe(401);
    const me = (await call('GET', '/api/panel/me', owner)).json<{
      username: string;
      role: { id: string };
      areas: string[];
    }>();
    expect(me.username).toBe('philip');
    expect(me.role.id).toBe('owner');
    expect(me.areas).toContain('roles');
  });

  test('Einstellungen nach Katalog: geprüft, gespeichert, nur mit CSRF-Token', async () => {
    const areas = (await call('GET', '/api/panel/settings', owner)).json<Array<{ area: { id: string } }>>();
    expect(areas.map((a) => a.area.id)).toEqual([
      'network',
      'chat',
      'voice',
      'social',
      'lobby',
      'website',
      'mornicraft',
      'build',
      'updates',
    ]);
    const saved = await call('PUT', '/api/panel/settings/chat', owner, { slowMode: 5, badWords: ['doof'] });
    expect(saved.json()).toMatchObject({ slowMode: 5, badWords: ['doof'], global: true });
    expect((await call('PUT', '/api/panel/settings/chat', owner, { slowMode: 999 })).statusCode).toBe(400);
    const noCsrf = await h.mm.app.inject({
      method: 'PUT',
      url: '/api/panel/settings/chat',
      headers: { cookie: owner.cookie },
      payload: { slowMode: 1 },
    });
    expect(noCsrf.statusCode).toBe(403);
  });

  test('Modi lassen sich in Wartung setzen und umbenennen', async () => {
    const res = await call('PATCH', '/api/panel/modes/duels', owner, {
      state: 'maintenance',
      name: { de: 'Duelle', en: 'Duels' },
    });
    expect(res.json<Mode>()).toMatchObject({ state: 'maintenance', name: { de: 'Duelle' } });
    expect((await call('PATCH', '/api/panel/modes/gibtsnicht', owner, { state: 'off' })).statusCode).toBe(
      404,
    );
  });

  test('die Weiterleitung lässt Server-Seiten durch, Registrieren und Einrichten nicht', async () => {
    const servers = await h.mm.app.inject({
      method: 'GET',
      url: '/panel/motor/api/servers',
      headers: { cookie: owner.cookie },
    });
    expect(servers.statusCode).toBe(200);
    expect(
      (await h.mm.app.inject({ method: 'POST', url: '/panel/motor/api/auth/register', payload: {} }))
        .statusCode,
    ).toBe(404);
    expect(
      (await h.mm.app.inject({ method: 'POST', url: '/panel/motor/api/setup', payload: {} })).statusCode,
    ).toBe(404);
  });
});
