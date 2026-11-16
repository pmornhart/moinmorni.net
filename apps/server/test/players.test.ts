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

  test('Sprachchat stummschalten: wie /voicemute – Dauer, Verlauf, Strafen-Seite, Aufheben, nur mit dem Recht', async () => {
    const MINUTES = 30;
    const SHORT = 5;
    const MINUTE_MS = 60_000;
    const OK = 200;
    const FORBIDDEN = 403;
    const NOT_FOUND = 404;
    const before = Date.now();
    const mute = await call('POST', '/api/panel/punishments', {
      player: 'Lena',
      kind: 'voice',
      minutes: MINUTES,
      reason: 'Schreien im Sprachchat',
    });
    expect(mute.statusCode).toBe(OK);
    const made = mute.json<{ kind: string; byName: string; expiresAt: string }>();
    expect(made).toMatchObject({ kind: 'voice', byName: 'philip', reason: 'Schreien im Sprachchat' });
    expect(Date.parse(made.expiresAt) - before).toBeGreaterThanOrEqual(MINUTES * MINUTE_MS);
    expect(h.mm.hub.punish.activeOf('voice')).toEqual([LENA]);
    const profile = (await call('GET', `/api/panel/players/${LENA}`)).json<{ history: unknown[] }>();
    expect(profile).toMatchObject({
      voiceMuted: { reason: 'Schreien im Sprachchat', until: made.expiresAt },
      // Schreiben im Chat geht weiter.
      muted: null,
    });
    expect(profile.history[0]).toMatchObject({
      kind: 'voice',
      reason: 'Schreien im Sprachchat',
      active: true,
    });
    const list = (await call('GET', '/api/panel/punishments')).json<
      Array<{ kind: string; active: boolean }>
    >();
    expect(list[0]).toMatchObject({ kind: 'voice', active: true });

    expect((await call('DELETE', `/api/panel/punishments/${LENA}/voice`)).statusCode).toBe(OK);
    expect((await call('DELETE', `/api/panel/punishments/${LENA}/voice`)).statusCode).toBe(NOT_FOUND);
    expect((await call('GET', `/api/panel/players/${LENA}`)).json()).toMatchObject({ voiceMuted: null });
    // Für immer: ohne Ende.
    const forever = await call('POST', '/api/panel/punishments', {
      player: 'Lena',
      kind: 'voice',
      minutes: null,
    });
    expect(forever.json()).toMatchObject({ kind: 'voice', expiresAt: null });
    await call('DELETE', `/api/panel/punishments/${LENA}/voice`);

    // Ein Moderator, dessen Rolle das Recht „voice-mute“ nicht hat: Sprachchat nein, Chat-Stumm weiter ja.
    type R = { id: string; game: string[] };
    const roles = (await call('GET', '/api/panel/roles')).json<R[]>();
    const withoutVoice = roles.map((r) =>
      r.id === 'moderator' ? { ...r, game: r.game.filter((g) => g !== 'voice-mute') } : r,
    );
    expect((await call('PUT', '/api/panel/roles', withoutVoice)).statusCode).toBe(OK);
    const made2 = await call('POST', '/api/panel/team', { username: 'mona', roleId: 'moderator' });
    const mona = await h.login('mona', made2.json<{ password: string }>().password);
    const asMona = (method: 'POST' | 'DELETE', url: string, payload?: object) =>
      h.mm.app.inject({
        method,
        url,
        payload,
        headers: { cookie: mona.cookie, 'x-csrf-token': mona.csrf },
      });
    const denied = await asMona('POST', '/api/panel/punishments', {
      player: 'Lena',
      kind: 'voice',
      minutes: SHORT,
    });
    expect(denied.statusCode).toBe(FORBIDDEN);
    expect(denied.json()).toEqual({ error: 'punish_no_right' });
    expect(h.mm.hub.punish.activeOf('voice')).toEqual([]);
    expect(
      (await asMona('POST', '/api/panel/punishments', { player: 'Lena', kind: 'mute', minutes: SHORT }))
        .statusCode,
    ).toBe(OK);
    expect((await asMona('DELETE', `/api/panel/punishments/${LENA}/mute`)).statusCode).toBe(OK);
    await call('POST', '/api/panel/punishments', { player: 'Lena', kind: 'voice', minutes: SHORT });
    expect((await asMona('DELETE', `/api/panel/punishments/${LENA}/voice`)).statusCode).toBe(FORBIDDEN);
    expect((await call('DELETE', `/api/panel/punishments/${LENA}/voice`)).statusCode).toBe(OK);
    expect((await call('PUT', '/api/panel/roles', roles)).statusCode).toBe(OK);
  });
});
