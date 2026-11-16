import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startFakeDiscord, type FakeDiscord } from './fake-discord.js';
import { connectPlugin, type FakePlugin } from './fake-plugin.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';

const LENA = '22222222-2222-2222-2222-222222222222';
const LENA_DC = '5555';
const VIEW = 1n << 10n;

const until = async (check: () => boolean | Promise<boolean>, ms = 4000): Promise<void> => {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > ms) throw new Error('Zeit abgelaufen');
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe('Discord-Bot (nachgebautes Discord)', () => {
  let h: Harness;
  let dc: FakeDiscord;
  let owner: { cookie: string; csrf: string };
  let proxy: FakePlugin;
  const call = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: object) =>
    h.mm.app.inject({ method, url, payload, headers: { cookie: owner.cookie, 'x-csrf-token': owner.csrf } });
  const roleByName = (name: string) => [...dc.guild.roles.values()].find((r) => r.name === name);
  const channelByName = (name: string) => [...dc.guild.channels.values()].find((c) => c.name === name);
  const interaction = (type: number, data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    h.mm.bot.handle({
      t: 'INTERACTION_CREATE',
      d: {
        id: `i${Math.random().toString(36).slice(2, 8)}`,
        token: 'tok',
        type,
        locale: 'de',
        data,
        member: { user: { id: LENA_DC, username: 'lena_dc' } },
        guild_id: dc.guild.id,
        ...extra,
      },
    });

  beforeAll(async () => {
    dc = await startFakeDiscord();
    h = await createHarness({
      env: {
        MM_DISCORD_TOKEN: 'test-token',
        MM_DISCORD_API: dc.api,
        MM_DISCORD_CLIENT_SECRET: 'client-secret',
      },
    });
    owner = await h.login('philip', OWNER_PASSWORD);
    h.mm.bot.start();
    const port = await h.mm.hub.listen('127.0.0.1', 0);
    proxy = await connectPlugin(
      `ws://127.0.0.1:${port}/hub`,
      'proxy',
      'proxy',
      h.mm.hub.keyFor('proxy', 'proxy'),
    );
    dc.guild.members.set(LENA_DC, { roles: [], communication_disabled_until: null });
  }, 60_000);
  afterAll(async () => {
    proxy.close();
    await h.cleanup();
    await dc.close();
  });

  test('Bot verbindet sich, merkt sich den Server und zeigt den Einladungslink', async () => {
    await until(() => dc.identified() > 0);
    type Status = { connected: boolean; guild: { name: string } | null; inviteUrl: string };
    await until(async () => (await call('GET', '/api/panel/discord')).json<Status>().guild !== null);
    const body = (await call('GET', '/api/panel/discord')).json<Status>();
    expect(body).toMatchObject({ connected: true, guild: { name: 'MoinMorni' }, setupDone: false });
    expect(body.inviteUrl).toContain('client_id=777');
    expect(body.inviteUrl).toContain('permissions=8');
  });

  test('„Server einrichten“: Rollen, Kanäle mit Rechten, Regeln, Hilfe, Status, Befehle, Community', async () => {
    const first = await call('POST', '/api/panel/discord/setup');
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ roles: 10, community: 'ok' });
    expect(roleByName('♛ Owner')).toMatchObject({ color: 0xff5555, permissions: '8', hoist: true });
    expect(roleByName('⚔ Moderator')).toBeTruthy();
    // Supporter wie jede Rolle der Vorlage: Farbe, oben in der Liste, erwähnbar, sieht die Team-Kanäle.
    const supporter = roleByName('✚ Supporter');
    expect(supporter).toMatchObject({ color: 0x22c55e, hoist: true, mentionable: true });
    expect(roleByName('✔ Verbunden')).toBeTruthy();
    expect(roleByName('Spieler')).toBeUndefined();

    const team = channelByName('🛡・team-chat');
    const everyoneTeam = team?.permission_overwrites?.find((o) => o.id === dc.guild.id);
    expect(BigInt(everyoneTeam?.deny ?? '0') & VIEW).toBe(VIEW);
    const supporterTeam = team?.permission_overwrites?.find((o) => o.id === supporter?.id);
    expect(BigInt(supporterTeam?.allow ?? '0') & VIEW).toBe(VIEW);
    expect(channelByName('Dorfplatz')).toMatchObject({ type: 2 });
    const rules = channelByName('📜・regeln');
    expect(dc.messages.get(rules?.id ?? '')?.[0]?.content).toContain('Regeln');
    const help = channelByName('🎫・hilfe');
    expect(JSON.stringify(dc.messages.get(help?.id ?? ''))).toContain('mm:ticket:open');
    const status = channelByName('🟢・status');
    expect(JSON.stringify(dc.messages.get(status?.id ?? ''))).toContain('MoinMorni');
    expect(dc.commands.map((c) => (c as { name: string }).name)).toEqual([
      'verbinden',
      'hilfe',
      'bewerben',
      'status',
    ]);
    expect(dc.guild.features).toContain('COMMUNITY');

    const roles = dc.guild.roles.size;
    const channels = dc.guild.channels.size;
    await call('POST', '/api/panel/discord/setup');
    expect(dc.guild.roles.size).toBe(roles);
    expect(dc.guild.channels.size).toBe(channels);
    expect(dc.messages.get(rules?.id ?? '')?.length).toBe(1);
  });

  test('Konto verbinden: Code im Spiel, /verbinden in Discord, Rang kommt mit', async () => {
    await proxy.request({ t: 'login', uuid: LENA, name: 'Lena', locale: 'de_de', bedrock: false });
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    h.mm.hub.players.setRole(LENA, 'vip');
    await proxy.request({ t: 'command', uuid: LENA, command: 'discord', args: [] });
    const msg = await proxy.next('msg', (m) => String(m['text']).includes('/verbinden'));
    const code = /<bold>([A-Z0-9]{6})<\/bold>/.exec(String(msg['text']))?.[1] ?? '';
    expect(code).toHaveLength(6);

    await interaction(2, { name: 'verbinden', options: [{ name: 'code', value: 'FALSCH' }] });
    expect(JSON.stringify(dc.replies.at(-1))).toContain('stimmt nicht');
    await interaction(2, { name: 'verbinden', options: [{ name: 'code', value: code.toLowerCase() }] });
    expect(JSON.stringify(dc.replies.at(-1))).toContain('Verbunden mit **Lena**');
    expect(dc.replies.at(-1)?.body.data['flags']).toBe(64);
    await proxy.next('msg', (m) => String(m['text']).includes('lena_dc'));
    const mem = dc.guild.members.get(LENA_DC);
    expect(mem?.roles).toEqual(
      expect.arrayContaining([roleByName('★ VIP')?.id, roleByName('✔ Verbunden')?.id]),
    );

    // Rang im Panel ändern → Discord zieht nach.
    await call('PUT', `/api/panel/players/${LENA}/role`, { roleId: 'media' });
    await until(() => Boolean(mem?.roles.includes(roleByName('▶ Media')?.id ?? '-')));
    expect(mem?.roles).not.toContain(roleByName('★ VIP')?.id);
  });

  test('Strafen gelten auch in Discord: Timeout, Stumm-Rolle, Gefängnis-Rolle, Bann, Team-Log', async () => {
    const teamlog = channelByName('📋・team-log');
    await call('POST', '/api/panel/punishments', {
      player: 'Lena',
      kind: 'mute',
      minutes: 30,
      reason: 'Spam',
    });
    await until(() => Boolean(dc.guild.members.get(LENA_DC)?.communication_disabled_until));
    await call('DELETE', `/api/panel/punishments/${LENA}/mute`);
    await until(() => dc.guild.members.get(LENA_DC)?.communication_disabled_until === null);

    await call('POST', '/api/panel/punishments', {
      player: 'Lena',
      kind: 'mute',
      minutes: null,
      reason: 'Dauerspam',
    });
    await until(() =>
      Boolean(dc.guild.members.get(LENA_DC)?.roles.includes(roleByName('🔇 Stumm')?.id ?? '-')),
    );
    await call('DELETE', `/api/panel/punishments/${LENA}/mute`);
    await until(() => !dc.guild.members.get(LENA_DC)?.roles.includes(roleByName('🔇 Stumm')?.id ?? '-'));

    // Gefängnis: Rolle „⛓ Gefängnis“ (sieht nur noch den Gefängnis-Kanal), Aufheben nimmt sie wieder.
    const jailRole = roleByName('⛓ Gefängnis')?.id ?? '-';
    await call('POST', '/api/panel/punishments', {
      player: 'Lena',
      kind: 'jail',
      minutes: 15,
      reason: 'Beleidigung',
    });
    await until(() => Boolean(dc.guild.members.get(LENA_DC)?.roles.includes(jailRole)));
    await call('DELETE', `/api/panel/punishments/${LENA}/jail`);
    await until(() => !dc.guild.members.get(LENA_DC)?.roles.includes(jailRole));

    await call('POST', '/api/panel/punishments', {
      player: 'Lena',
      kind: 'ban',
      minutes: 60,
      reason: 'Hacks',
    });
    await until(() => dc.guild.bans.has(LENA_DC));
    await call('DELETE', `/api/panel/punishments/${LENA}/ban`);
    await until(() => !dc.guild.bans.has(LENA_DC));
    const log = JSON.stringify(dc.messages.get(teamlog?.id ?? ''));
    expect(log).toContain('gebannt');
    expect(log).toContain('Hacks');
    expect(log).toContain('entbannt');
    expect(log).toContain('Gefängnis');
    expect(log).toContain('Beleidigung');
  });

  test('MorniCraft-Bewerbung: Formular in Discord, #bewerbungen, Annehmen per Knopf, Webseite mit Discord-Anmeldung, Whitelist', async () => {
    const PHILIP_UUID = '11111111-1111-1111-1111-111111111111';
    const PHILIP_DC = '6666';
    const apps = channelByName('📝・bewerbungen');
    const lastReply = () => dc.replies.at(-1)?.body;
    const field = (custom_id: string, value: string) => ({ type: 1, components: [{ custom_id, value }] });

    // /bewerben öffnet das Formular.
    await interaction(2, { name: 'bewerben' });
    expect(lastReply()).toMatchObject({ type: 9, data: { custom_id: 'mm:apply-form' } });
    await interaction(5, {
      custom_id: 'mm:apply-form',
      components: [
        field('minecraft', 'Lena_Baut'),
        field('about', 'Ich baue gern Häuser im Alpenstil und spiele seit Jahren.'),
        field('why', 'Weil ihr nett seid.'),
        field('age', '15'),
      ],
    });
    expect(JSON.stringify(lastReply())).toContain('Lena_Baut');
    await until(() => (dc.messages.get(apps?.id ?? '') ?? []).length > 0);
    const posted = (dc.messages.get(apps?.id ?? '') ?? [])[0] as unknown as {
      id: string;
      embeds: Array<{ title: string }>;
      components: Array<{ components: Array<{ custom_id: string }> }>;
    };
    expect(posted.embeds[0]?.title).toContain('Lena_Baut');
    const accept = posted.components[0]?.components[0]?.custom_id ?? '';
    expect(accept).toMatch(/^mm:app-accept:\d+$/);

    // Noch eine Bewerbung geht nicht, solange eine offen ist; Lena selbst darf nicht entscheiden.
    await interaction(2, { name: 'bewerben' });
    expect(JSON.stringify(lastReply())).toContain('liegt beim Team');
    await interaction(3, { custom_id: accept });
    expect(JSON.stringify(lastReply())).toContain('Entscheiden darf nur das Team');

    // Philip (Owner, Konto verbunden) nimmt an → Whitelist, Nachricht angepasst, Direktnachricht an Lena.
    h.mm.hub.players.seen({ uuid: PHILIP_UUID, name: 'Philip', bedrock: false });
    h.mm.hub.players.setRole(PHILIP_UUID, 'owner');
    h.mm.hub.players.setDiscord(PHILIP_UUID, PHILIP_DC);
    await interaction(
      3,
      { custom_id: accept },
      { member: { user: { id: PHILIP_DC, username: 'philip_dc' } } },
    );
    expect(JSON.stringify(lastReply())).toContain('angenommen');
    await until(() => (dc.messages.get(`8${LENA_DC}`) ?? []).length > 0);
    expect(JSON.stringify(dc.messages.get(`8${LENA_DC}`))).toContain('Willkommen bei MorniCraft');
    await until(
      () =>
        ((dc.messages.get(apps?.id ?? '') ?? [])[0] as unknown as { components: unknown[] }).components
          .length === 0,
    );
    const list = (await call('GET', '/api/panel/whitelist')).json<Array<{ displayName: string }>>();
    expect(list.map((w) => w.displayName)).toEqual(['Lena_Baut']);

    // Hub: MorniCraft offen, Lena_Baut darf hinein (der Server schläft und wird geweckt), ein Fremder nicht.
    h.mm.stores.patchMode('mornicraft', { state: 'on' }, 'test');
    const toldAbout = (uuid: string, part: string) =>
      proxy.next('msg', (m) => m['uuid'] === uuid && String(m['text']).includes(part));
    await proxy.request({ t: 'login', uuid: LENA, name: 'Lena_Baut', locale: 'de_de', bedrock: false });
    await proxy.request({ t: 'connecting', uuid: LENA, server: 'mornicraft' });
    expect((await toldAbout(LENA, 'MorniCraft'))['text']).not.toContain('nicht auf der Liste');
    const STRANGER = '99999999-9999-9999-9999-999999999999';
    await proxy.request({ t: 'login', uuid: STRANGER, name: 'Fremder', locale: 'de_de', bedrock: false });
    expect(await proxy.request({ t: 'connecting', uuid: STRANGER, server: 'mornicraft' })).toMatchObject({
      data: { allow: false },
    });
    await toldAbout(STRANGER, 'nicht auf der Liste');

    // Webseite: mit Discord anmelden (OAuth2), dann bewerben.
    const web = (method: 'GET' | 'POST', url: string, cookie = '', payload?: object) =>
      h.mm.app.inject({ method, url, payload, headers: cookie ? { cookie } : {} });
    expect((await web('GET', '/api/public/apply')).json()).toMatchObject({
      open: true,
      discordLogin: true,
      me: null,
    });
    const login = await web('GET', '/api/public/apply/login');
    expect(login.statusCode).toBe(302);
    const target = new URL(String(login.headers.location));
    expect(target.host).toBe('discord.com');
    expect(target.searchParams.get('client_id')).toBe('777');
    expect(target.searchParams.get('scope')).toBe('identify');
    const state = target.searchParams.get('state') ?? '';
    const stateCookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
    const wrong = await web('GET', `/api/public/apply/callback?code=good-code&state=falsch`, stateCookie);
    expect(String(wrong.headers.location)).toContain('fehler=discord_login_failed');
    const back = await web('GET', `/api/public/apply/callback?code=good-code&state=${state}`, stateCookie);
    expect(back.headers.location).toBe('/mornicraft/bewerben');
    const cookies = ([] as string[]).concat(back.headers['set-cookie'] ?? []);
    const session = cookies.find((c) => c.startsWith('mm_apply='))?.split(';')[0] ?? '';
    expect((await web('GET', '/api/public/apply', session)).json()).toMatchObject({
      me: { name: 'Lena' },
      application: { status: 'accepted', minecraftName: 'Lena_Baut' },
    });
    expect(
      (await web('POST', '/api/public/apply', '', { minecraftName: 'X_y', answers: {} })).statusCode,
    ).toBe(400);
    const sent = await web('POST', '/api/public/apply', session, {
      minecraftName: 'Lena_Zwei',
      answers: { about: 'Mein Zweitkonto zum Bauen und Ausprobieren.', why: 'Zum Testen.' },
    });
    expect(sent.json()).toMatchObject({ status: 'pending', minecraftName: 'Lena_Zwei' });
    const pending = (await call('GET', '/api/panel/applications?status=pending')).json<
      Array<{ id: number }>
    >();
    expect(pending).toHaveLength(1);
    const no = await call('POST', `/api/panel/applications/${pending[0]?.id}/decide`, {
      accept: false,
      note: 'Ein Konto reicht.',
    });
    expect(no.json()).toMatchObject({ status: 'rejected', decidedBy: 'philip' });
    await until(() => JSON.stringify(dc.messages.get(`8${LENA_DC}`)).includes('Ein Konto reicht.'));
  });

  test('Ticket öffnen und schließen, Begrüßung neuer Mitglieder', async () => {
    dc.guild.members.set(LENA_DC, { roles: [], communication_disabled_until: null });
    await interaction(3, { custom_id: 'mm:ticket:open' });
    const thread = [...dc.guild.channels.values()].find((c) => c.name.startsWith('Ticket – lena_dc'));
    expect(thread).toMatchObject({ type: 12, members: [LENA_DC] });
    expect(JSON.stringify(dc.messages.get(thread?.id ?? ''))).toContain('mm:ticket:close');
    await interaction(3, { custom_id: 'mm:ticket:close' }, { channel_id: thread?.id });
    expect(thread).toMatchObject({ archived: true, locked: true });

    await h.mm.bot.handle({ t: 'GUILD_MEMBER_ADD', d: { guild_id: dc.guild.id, user: { id: '6666' } } });
    const welcome = channelByName('👋・willkommen');
    expect(JSON.stringify(dc.messages.get(welcome?.id ?? ''))).toContain('<@6666>');
  });
});
