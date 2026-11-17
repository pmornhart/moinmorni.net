/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { FAKE_CLIENT_SECRET, FAKE_TOKENS, startFakeDiscord, type FakeDiscord } from './fake-discord.js';
import { connectPlugin, type FakePlugin } from './fake-plugin.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';
import { until } from './wait.js';

const LENA = '22222222-2222-2222-2222-222222222222';
const LENA_DC = '5555';
const MIA = '33333333-3333-3333-3333-333333333333';
// Code: sechs Zeichen ohne Verwechsler, z. B. "K7QX2M".
// https://regex101.com/?flavor=javascript&regex=%5E%5BA-HJ-NP-Z2-9%5D%7B6%7D%24&testString=K7QX2M
const CODE = /^[A-HJ-NP-Z2-9]{6}$/;

type Session = { cookie: string; csrf: string };
interface Links {
  minecraft: { uuid: string; name: string; confirmed: boolean } | null;
  discord: { id: string; name: string } | null;
}

describe('Verbindungen der Team-Konten (Minecraft per Code im Spiel, Discord per Code beim Bot)', () => {
  let h: Harness;
  let dc: FakeDiscord;
  let owner: Session;
  let lena: Session;
  let max: Session;
  let lenaId = 0;
  let proxy: FakePlugin;
  const call = (
    session: Session,
    method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'PATCH',
    url: string,
    payload?: object,
  ) =>
    h.mm.app.inject({
      method,
      url,
      payload,
      headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
    });
  const links = async (s: Session) => (await call(s, 'GET', '/api/panel/account/links')).json<Links>();
  const code = async (s: Session, kind: 'minecraft' | 'discord') =>
    (await call(s, 'POST', `/api/panel/account/links/${kind}/code`)).json<{ code: string }>().code;
  const typeInGame = (uuid: string, args: string[]) =>
    proxy.request({ t: 'command', uuid, command: 'verbinden', args });
  const rank = (uuid: string) => h.mm.hub.players.roleOf(uuid).id;
  const roleByName = (name: string) => [...dc.guild.roles.values()].find((r) => r.name === name);
  const hasRole = (name: string) =>
    Boolean(dc.guild.members.get(LENA_DC)?.roles.includes(roleByName(name)?.id ?? '-'));
  const discordVerbinden = (value: string) =>
    h.mm.bot.handle({
      t: 'INTERACTION_CREATE',
      d: {
        id: `i${Math.random().toString(36).slice(2, 8)}`,
        token: 'tok',
        type: 2,
        locale: 'de',
        data: { name: 'verbinden', options: [{ name: 'code', value }] },
        guild_id: dc.guild.id,
        member: { user: { id: LENA_DC, username: 'lena_dc' } },
      },
    });

  beforeAll(async () => {
    dc = await startFakeDiscord();
    h = await createHarness({
      env: {
        MM_DISCORD_TOKEN: FAKE_TOKENS.main,
        MM_DISCORD_API: dc.api,
        MM_DISCORD_CDN: dc.cdn,
        MM_DISCORD_CLIENT_SECRET: FAKE_CLIENT_SECRET,
      },
    });
    owner = await h.login('philip', OWNER_PASSWORD);
    const l = await call(owner, 'POST', '/api/panel/team', { username: 'lena', roleId: 'moderator' });
    lena = await h.login('lena', l.json<{ password: string }>().password);
    lenaId = l.json<{ member: { id: number } }>().member.id;
    const m = await call(owner, 'POST', '/api/panel/team', { username: 'max', roleId: 'supporter' });
    max = await h.login('max', m.json<{ password: string }>().password);
    h.mm.bot.start();
    const port = await h.mm.hub.listen('127.0.0.1', 0);
    proxy = await connectPlugin(
      `ws://127.0.0.1:${port}/hub`,
      'proxy',
      'proxy',
      h.mm.hub.keyFor('proxy', 'proxy'),
    );
    await proxy.request({ t: 'login', uuid: LENA, name: 'Lena', locale: 'de_de', bedrock: false });
    await proxy.request({ t: 'login', uuid: MIA, name: 'Mia', locale: 'en_us', bedrock: false });
    dc.guild.members.set(LENA_DC, { roles: [], communication_disabled_until: null });
    await until(
      async () => (await call(owner, 'GET', '/api/panel/discord')).json<{ guild: unknown }>().guild !== null,
    );
    const invite = new URL(
      (await call(owner, 'GET', '/api/panel/discord')).json<{ inviteUrl: string }>().inviteUrl,
    );
    dc.setBotPermissions(BigInt(invite.searchParams.get('permissions') ?? '0'));
    await h.mm.bot.setup();
  }, 90_000);
  afterAll(async () => {
    proxy.close();
    await h.cleanup();
    await dc.close();
  });

  test('Minecraft: Code im Panel, /verbinden im Spiel → sofort Team-Rang; einmalig, falsch, zu oft', async () => {
    expect(await links(lena)).toEqual({ minecraft: null, discord: null, discordReady: true });
    expect(rank(LENA)).toBe('player');
    const c = await code(lena, 'minecraft');
    expect(c).toMatch(CODE);
    // Ohne Anmeldung gibt es keinen Code.
    expect(
      (await h.mm.app.inject({ method: 'POST', url: '/api/panel/account/links/minecraft/code' })).statusCode,
    ).toBe(401);

    await typeInGame(LENA, [c.toLowerCase()]);
    await until(() => rank(LENA) === 'moderator');
    expect(await links(lena)).toMatchObject({ minecraft: { uuid: LENA, name: 'Lena', confirmed: true } });
    // Derselbe Code ein zweites Mal (von Mia): nichts passiert.
    await typeInGame(MIA, [c]);
    expect(rank(MIA)).toBe('player');
    // Fünf falsche Codes, dann „zu oft“ – auch der richtige zählt dann nicht.
    await ['AAAAAA', 'BBBBBB', 'CCCCCC', 'DDDDDD', 'EEEEEE'].reduce(async (b, x) => {
      await b;
      await typeInGame(MIA, [x]);
    }, Promise.resolve());
    const maxCode = await code(max, 'minecraft');
    await typeInGame(MIA, [maxCode]);
    expect(rank(MIA)).toBe('player');
    expect((await links(max)).minecraft).toBeNull();
  });

  test('Fremde UUID: niemand verbindet ein Minecraft-Konto, in dem er nicht selbst spielt; Beweis gewinnt', async () => {
    // Max' Code tippt Lena (sie spielt wirklich mit LENA): dann gehört LENA zu Max, nicht mehr zu Lena.
    const c = await code(max, 'minecraft');
    await typeInGame(LENA, [c]);
    expect((await links(max)).minecraft).toMatchObject({ uuid: LENA, confirmed: true });
    expect((await links(lena)).minecraft).toBeNull();
    expect(rank(LENA)).toBe('supporter');
    // Zurück zu Lena.
    await typeInGame(LENA, [await code(lena, 'minecraft')]);
    expect(rank(LENA)).toBe('moderator');
    expect((await links(max)).minecraft).toBeNull();
    // Per Name im Motor verbinden geht nicht mehr (Weiterleitung gesperrt).
    const motor = await h.mm.app.inject({
      method: 'PUT',
      url: '/panel/motor/api/account/minecraft',
      payload: { name: 'Notch' },
      headers: { cookie: lena.cookie, 'x-csrf-token': lena.csrf },
    });
    expect(motor.statusCode).toBeGreaterThanOrEqual(400);
  });

  test('Discord: Code beim Bot → Team-Rolle; Rollenwechsel, Sperre, Trennen und Entfernen ziehen überall nach', async () => {
    const c = await code(lena, 'discord');
    await discordVerbinden(c);
    expect(JSON.stringify(dc.replies.at(-1)?.body)).toContain('lena');
    expect((await links(lena)).discord).toMatchObject({ id: LENA_DC, name: 'lena_dc' });
    await until(() => hasRole('⚔ Moderator'));

    // Owner macht Lena zur Supporterin: im Spiel und in Discord sofort.
    expect(
      (await call(owner, 'PATCH', `/api/panel/team/${lenaId}`, { roleId: 'supporter' })).statusCode,
    ).toBe(200);
    await until(() => rank(LENA) === 'supporter' && hasRole('✚ Supporter') && !hasRole('⚔ Moderator'));
    const view = (await call(owner, 'GET', '/api/panel/team')).json<
      Array<{ id: number; minecraft: unknown; discord: unknown }>
    >();
    expect(view.find((v) => v.id === lenaId)).toMatchObject({
      minecraft: { uuid: LENA, confirmed: true },
      discord: { id: LENA_DC, name: 'lena_dc' },
    });

    // Minecraft trennen: Team-Rang weg, ein von Hand vergebener Spieler-Rang bleibt.
    h.mm.hub.players.setRole(LENA, 'vip');
    await call(lena, 'DELETE', '/api/panel/account/links/minecraft');
    expect((await links(lena)).minecraft).toBeNull();
    expect(rank(LENA)).toBe('vip');
    // Discord bleibt über das Team-Konto verbunden.
    expect(hasRole('✚ Supporter')).toBe(true);

    // Gesperrt: Rolle weg; entsperrt: wieder da.
    await call(owner, 'PUT', `/api/panel/team/${lenaId}/disabled`, { disabled: true });
    await until(() => !hasRole('✚ Supporter'));
    await call(owner, 'PUT', `/api/panel/team/${lenaId}/disabled`, { disabled: false });
    await until(() => hasRole('✚ Supporter'));

    // Konto entfernt: Team-Rolle und „Verbunden“ weg.
    await call(owner, 'DELETE', `/api/panel/team/${lenaId}`);
    await until(() => !hasRole('✚ Supporter') && !hasRole('✔ Verbunden'));
  }, 60_000);
});
