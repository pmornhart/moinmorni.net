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
    h = await createHarness({ env: { MM_DISCORD_TOKEN: 'test-token', MM_DISCORD_API: dc.api } });
    owner = await h.login('philip', OWNER_PASSWORD);
    h.mm.bot.start();
    const port = await h.mm.hub.listen('127.0.0.1', 0);
    proxy = await connectPlugin(`ws://127.0.0.1:${port}/hub`, 'proxy', 'proxy', h.mm.hub.keyFor('proxy'));
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
    expect(first.json()).toMatchObject({ roles: 9, community: 'ok' });
    expect(roleByName('♛ Owner')).toMatchObject({ color: 0xff5555, permissions: '8', hoist: true });
    expect(roleByName('⚔ Moderator')).toBeTruthy();
    expect(roleByName('✔ Verbunden')).toBeTruthy();
    expect(roleByName('Spieler')).toBeUndefined();

    const team = channelByName('🛡・team-chat');
    const everyoneTeam = team?.permission_overwrites?.find((o) => o.id === dc.guild.id);
    expect(BigInt(everyoneTeam?.deny ?? '0') & VIEW).toBe(VIEW);
    expect(channelByName('Dorfplatz')).toMatchObject({ type: 2 });
    const rules = channelByName('📜・regeln');
    expect(dc.messages.get(rules?.id ?? '')?.[0]?.content).toContain('Regeln');
    const help = channelByName('🎫・hilfe');
    expect(JSON.stringify(dc.messages.get(help?.id ?? ''))).toContain('mm:ticket:open');
    const status = channelByName('🟢・status');
    expect(JSON.stringify(dc.messages.get(status?.id ?? ''))).toContain('MoinMorni');
    expect(dc.commands.map((c) => (c as { name: string }).name)).toEqual(['verbinden', 'hilfe', 'status']);
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
