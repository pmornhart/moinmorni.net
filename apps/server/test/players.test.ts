import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { saveModePlayer } from '../src/hub/mornicraft.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';

const LENA = '22222222-2222-2222-2222-222222222222';

describe('Panel: Spieler und Strafen', () => {
  let h: Harness;
  let owner: { cookie: string; csrf: string };
  const call = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: object, csrf = true) =>
    h.mm.app.inject({
      method,
      url,
      payload,
      headers: { cookie: owner.cookie, ...(csrf ? { 'x-csrf-token': owner.csrf } : {}) },
    });

  beforeAll(async () => {
    h = await createHarness();
    owner = await h.login('philip', OWNER_PASSWORD);
    h.mm.hub.players.seen({ uuid: LENA, name: 'Lena', bedrock: false });
  }, 60_000);
  afterAll(async () => {
    await h.cleanup();
  });

  test('Suche, Profil, Rang vergeben', async () => {
    const list = (await call('GET', '/api/panel/players?q=len')).json<{ players: Array<{ name: string }> }>();
    expect(list.players.map((p) => p.name)).toEqual(['Lena']);
    expect((await call('GET', '/api/panel/players?q=%25')).json<{ players: unknown[] }>().players).toEqual(
      [],
    );

    const role = await call('PUT', `/api/panel/players/${LENA}/role`, { roleId: 'vip' });
    expect(role.json()).toMatchObject({ ownRole: 'vip', role: { id: 'vip', symbol: '★' } });
    expect((await call('PUT', `/api/panel/players/${LENA}/role`, { roleId: 'chef' })).statusCode).toBe(400);
    await call('PUT', `/api/panel/players/${LENA}/role`, { roleId: null });
    expect((await call('GET', `/api/panel/players/${LENA}`)).json()).toMatchObject({
      ownRole: null,
      mornicraft: null,
    });
  });

  test('Spieler-Seite zeigt, was MorniCraft meldet', async () => {
    const data = { online: false, afk: false, homes: [], clan: null, graves: [] };
    saveModePlayer(h.mm.db, 'mornicraft', LENA, data);
    expect((await call('GET', `/api/panel/players/${LENA}`)).json()).toMatchObject({ mornicraft: data });
  });

  test('Bann verhängen und aufheben – mit Verlauf; ohne CSRF-Token nichts', async () => {
    expect(
      (await call('POST', '/api/panel/punishments', { player: 'Lena', kind: 'ban', minutes: 60 }, false))
        .statusCode,
    ).toBe(403);
    const ban = await call('POST', '/api/panel/punishments', {
      player: 'lena',
      kind: 'ban',
      minutes: 60,
      reason: 'Hacks',
    });
    expect(ban.statusCode).toBe(200);
    expect(ban.json()).toMatchObject({ kind: 'ban', reason: 'Hacks', byName: 'philip' });
    expect((await call('GET', `/api/panel/players/${LENA}`)).json()).toMatchObject({
      banned: { reason: 'Hacks' },
      history: [{ kind: 'ban' }],
    });
    expect(h.mm.hub.punish.activeBans().map((b) => b.uuid)).toEqual([LENA]);

    const list = (await call('GET', '/api/panel/punishments')).json<
      Array<{ playerName: string; active: boolean }>
    >();
    expect(list[0]).toMatchObject({ playerName: 'Lena', active: true });

    expect((await call('DELETE', `/api/panel/punishments/${LENA}/ban`)).statusCode).toBe(200);
    expect((await call('DELETE', `/api/panel/punishments/${LENA}/ban`)).statusCode).toBe(404);
    expect((await call('GET', `/api/panel/players/${LENA}`)).json()).toMatchObject({ banned: null });
    expect(
      (await call('POST', '/api/panel/punishments', { player: 'Lena', kind: 'kick', minutes: null }))
        .statusCode,
    ).toBe(400);
  });
});
