/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { LOGO_PNG_BASE64 } from '../src/discord/logo.js';
import { FAKE_CLIENT_SECRET, FAKE_TOKENS, startFakeDiscord, type FakeDiscord } from './fake-discord.js';
import { connectPlugin, type FakePlugin } from './fake-plugin.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';
import { until } from './wait.js';

const LENA = '22222222-2222-2222-2222-222222222222';
const LENA_DC = '5555';
const VIEW = 1n << 10n;
const SEND = 1n << 11n;
const ADMIN = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

interface Progress {
  running: boolean;
  error: string | null;
  missing: string[];
  waitUntil: string | null;
  steps: Array<{ key: string; state: string; done: number; total: number; error: string | null }>;
  report: {
    roles: number;
    channels: number;
    created: number;
    kept: string[];
    community: string;
    icon: string;
    missing: string[];
    ownerAdminManual: boolean;
  } | null;
}
interface Status {
  connected: boolean;
  configured: boolean;
  guild: { name: string } | null;
  inviteUrl: string;
  permissions: string[];
  setupDone: boolean;
  setup: Progress;
  canEditAccess: boolean;
  credentials: { token: { set: boolean; source: string | null } };
}

/** Viele Schritte nacheinander mit dem nachgebauten Discord – unter Last (alle Testdateien parallel) brauchen sie länger. */
const SLOW_TEST_MS = 90_000;
describe('Discord-Bot (nachgebautes Discord)', () => {
  let h: Harness;
  let dc: FakeDiscord;
  let owner: { cookie: string; csrf: string };
  let proxy: FakePlugin;
  const call = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: object) =>
    h.mm.app.inject({ method, url, payload, headers: { cookie: owner.cookie, 'x-csrf-token': owner.csrf } });
  const status = async (): Promise<Status> => (await call('GET', '/api/panel/discord')).json<Status>();
  const roleByName = (name: string) => [...dc.guild.roles.values()].find((r) => r.name === name);
  const channelByName = (name: string) => [...dc.guild.channels.values()].find((c) => c.name === name);
  const messagesIn = (name: string) => dc.messages.get(channelByName(name)?.id ?? '') ?? [];
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
  /** „Server einrichten“ im Panel und warten, bis es fertig ist; dabei mitschreiben, ob Discord gebremst hat. */
  const setup = async (): Promise<{ progress: Progress; waited: boolean }> => {
    const start = await call('POST', '/api/panel/discord/setup');
    expect(start.statusCode).toBe(200);
    const seen = { waited: false };
    await until(async () => {
      const s = (await status()).setup;
      if (s.waitUntil) seen.waited = true;
      return !s.running;
    }, 20_000);
    return { progress: (await status()).setup, waited: seen.waited };
  };

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

  test('Bot verbindet sich, merkt sich den Server, Einladung mit genau den nötigen Rechten (ohne Administrator)', async () => {
    await until(() => dc.identified() > 0);
    await until(async () => (await status()).guild !== null);
    const body = await status();
    expect(body).toMatchObject({
      connected: true,
      guild: { name: 'MoinMorni' },
      setupDone: false,
      canEditAccess: true,
    });
    expect(body.credentials.token).toEqual({ set: true, source: 'env' });
    const invite = new URL(body.inviteUrl);
    expect(invite.searchParams.get('client_id')).toBe('777');
    expect(invite.searchParams.get('scope')).toBe('bot applications.commands');
    const perms = BigInt(invite.searchParams.get('permissions') ?? '0');
    expect(perms & ADMIN).toBe(0n);
    expect(perms & MANAGE_GUILD).toBe(MANAGE_GUILD);
    expect(body.permissions).toEqual(
      expect.arrayContaining([
        'manageRoles',
        'manageChannels',
        'manageGuild',
        'banMembers',
        'moderateMembers',
      ]),
    );
    expect(body.permissions).not.toContain('administrator');
    // Ab jetzt hat die Bot-Rolle genau diese Rechte – wie nach dem Einladen mit dem Link.
    dc.setBotPermissions(perms);
    // Kein Profilbild → einmal das MoinMorni-Logo.
    await until(() => dc.bots.main.avatar !== null);
  });

  test('Fehlende Rechte: freundlicher Abbruch mit der Liste, was fehlt', async () => {
    const before = dc.botRole().permissions;
    dc.setBotPermissions(VIEW | SEND);
    const { progress } = await setup();
    expect(progress.error).toBe('discord_missing_permissions');
    expect(progress.missing).toEqual(expect.arrayContaining(['manageRoles', 'manageChannels']));
    expect(progress.steps.find((s) => s.key === 'check')).toMatchObject({ state: 'failed' });
    dc.setBotPermissions(BigInt(before));
  });

  test('„Server einrichten“ mit genau den Einladungs-Rechten: Rollen in Reihenfolge, Kanäle, Nachrichten, Befehle, Community, Symbol – auch wenn Discord bremst', async () => {
    // Kanäle anlegen: "/guilds/900/channels" ja, "/guilds/900/roles" nein.
    // https://regex101.com/?flavor=javascript&regex=%5E%5C%2Fguilds%5C%2F%5Cd%2B%5C%2Fchannels%24&testString=%2Fguilds%2F900%2Fchannels
    dc.limit('POST', /^\/guilds\/\d+\/channels$/, 2, 0.4);
    const { progress, waited } = await setup();
    expect(progress.error).toBeNull();
    expect(waited).toBe(true);
    expect(progress.steps.map((s) => [s.key, s.state])).toEqual([
      ['check', 'done'],
      ['roles', 'done'],
      ['channels', 'done'],
      ['messages', 'done'],
      ['commands', 'done'],
      ['community', 'done'],
      ['icon', 'done'],
    ]);
    expect(progress.report).toMatchObject({
      roles: 11,
      community: 'ok',
      icon: 'set',
      ownerAdminManual: true,
    });

    // Rollen: Symbol im Namen, Farbe der Ränge, Reihenfolge wie die Ränge (oben = wichtiger), alle unter dem Bot.
    const order = [
      '♛ Owner',
      '✦ Admin',
      '⚔ Moderator',
      '✚ Supporter',
      '⚒ Builder',
      '▶ Media',
      '★ VIP',
      '🤖 Bot',
      '✔ Verbunden',
      '🔇 Stumm',
      '⛓ Gefängnis',
    ];
    const positions = order.map((n) => roleByName(n)?.position ?? -1);
    expect(positions).toEqual([...positions].sort((a, b) => b - a));
    expect(Math.min(...positions)).toBeGreaterThan(0);
    expect(Math.max(...positions)).toBeLessThan(dc.botRole().position);
    expect(roleByName('♛ Owner')).toMatchObject({ color: 0xff5555, hoist: true });
    // Supporter wie jede Rolle der Vorlage: Farbe, oben in der Liste, erwähnbar.
    expect(roleByName('✚ Supporter')).toMatchObject({ color: 0x22c55e, hoist: true, mentionable: true });
    // „Administrator“ vergibt der Bot nicht (hat ihn selbst nicht) – das sagt der Bericht.
    expect(BigInt(roleByName('♛ Owner')?.permissions ?? '1') & ADMIN).toBe(0n);
    expect(roleByName('Spieler')).toBeUndefined();
    expect(dc.guild.members.get('777')?.roles).toContain(roleByName('🤖 Bot')?.id);

    // Kanäle mit Emoji in Kategorien; Team nur fürs Team, der Bot sieht trotzdem alles.
    ['📢 Info', '💬 Community', '🎫 Hilfe', '🔊 Sprache', '🛡 Team', '⛓ Gefängnis'].forEach((n) =>
      expect(channelByName(n)).toMatchObject({ type: 4 }),
    );
    [
      '👋・willkommen',
      '📜・regeln',
      '📣・ankündigungen',
      '📰・news',
      '🟢・status',
      '🎮・spielmodi',
      '💬・chat',
      '📸・bilder-und-clips',
      '💡・vorschläge',
      '❓・hilfe',
      '🎫・tickets',
      '📝・bewerbungen',
      '🛡・team-chat',
      '📋・team-log',
      '📥・bewerbungs-eingang',
      '⚖・strafen-log',
      '⛓・gefängnis',
    ].forEach((n) => expect(channelByName(n), n).toBeTruthy());
    expect(channelByName('📰・news')?.parent_id).toBe(channelByName('📢 Info')?.id);
    const team = channelByName('🛡・team-chat');
    const everyone = team?.permission_overwrites?.find((o) => o.id === dc.guild.id);
    expect(BigInt(everyone?.deny ?? '0') & VIEW).toBe(VIEW);
    const botOverwrite = team?.permission_overwrites?.find((o) => o.id === '777' && o.type === 1);
    expect(BigInt(botOverwrite?.allow ?? '0') & VIEW).toBe(VIEW);
    const supporterTeam = team?.permission_overwrites?.find((o) => o.id === roleByName('✚ Supporter')?.id);
    expect(BigInt(supporterTeam?.allow ?? '0') & VIEW).toBe(VIEW);
    // Gefängnis: nur die Gefängnis-Rolle (und das Team) sieht den Kanal; in allen anderen ist sie ausgesperrt.
    const jail = channelByName('⛓・gefängnis');
    expect(BigInt(jail?.permission_overwrites?.find((o) => o.id === dc.guild.id)?.deny ?? '0') & VIEW).toBe(
      VIEW,
    );
    expect(
      BigInt(jail?.permission_overwrites?.find((o) => o.id === roleByName('⛓ Gefängnis')?.id)?.allow ?? '0') &
        VIEW,
    ).toBe(VIEW);
    expect(channelByName('Dorfplatz')).toMatchObject({ type: 2 });
    // Offene Kanäle: schreiben und reden nur mit verbundenem Minecraft-Konto (oder Team); Info-Kanäle nur lesen.
    const SEND = 1n << 11n;
    const SPEAK = 1n << 21n;
    const rule = (channel: string, role: string | undefined) =>
      channelByName(channel)?.permission_overwrites?.find((o) => o.id === role) ?? { allow: '0', deny: '0' };
    const linked = roleByName('✔ Verbunden')?.id;
    const moderator = roleByName('⚔ Moderator')?.id;
    expect(BigInt(rule('💬・chat', dc.guild.id).deny) & SEND).toBe(SEND);
    expect(BigInt(rule('💬・chat', linked).allow) & SEND).toBe(SEND);
    expect(BigInt(rule('💬・chat', moderator).allow) & SEND).toBe(SEND);
    expect(BigInt(rule('📸・bilder-und-clips', linked).allow) & SEND).toBe(SEND);
    expect(BigInt(rule('Dorfplatz', dc.guild.id).deny) & SPEAK).toBe(SPEAK);
    expect(BigInt(rule('Dorfplatz', linked).allow) & SPEAK).toBe(SPEAK);
    expect(BigInt(rule('📜・regeln', dc.guild.id).deny) & SEND).toBe(SEND);
    expect(BigInt(rule('📜・regeln', linked).allow) & SEND).toBe(0n);

    // Nachrichten: Begrüßung mit Bild der Webseite und Adresse, Regeln aus dem Panel, Knöpfe, Spielmodi, Status.
    const welcome = JSON.stringify(messagesIn('👋・willkommen'));
    expect(welcome).toContain('/bilder/hero-tag.webp');
    expect(welcome).toContain('moinmorni.net');
    expect(welcome).toContain('19132');
    expect(JSON.stringify(messagesIn('📜・regeln'))).toContain('Freundlich bleiben');
    expect(JSON.stringify(messagesIn('❓・hilfe'))).toContain('mm:ticket:open');
    expect(JSON.stringify(messagesIn('🎫・tickets'))).toContain('mm:ticket:open');
    const apply = JSON.stringify(messagesIn('📝・bewerbungen'));
    expect(apply).toContain('mm:apply:team:moderator');
    expect(apply).not.toContain('mm:apply:team:admin');
    const modes = JSON.stringify(messagesIn('🎮・spielmodi'));
    expect(modes).toContain('/spielmodi/duels');
    expect(modes).toContain('/bilder/figur-duels.webp');
    expect(JSON.stringify(messagesIn('🟢・status'))).toContain('MoinMorni');
    expect(dc.commands.map((c) => (c as { name: string }).name)).toEqual([
      'verbinden',
      'hilfe',
      'bewerben',
      'status',
    ]);
    expect(dc.guild.features).toContain('COMMUNITY');
    // Server-Symbol: das MoinMorni-Logo, auf dem Bilder-Server von Discord.
    const icon = await fetch(`${dc.cdn}/icons/${dc.guild.id}/${dc.guild.icon}.png`);
    expect(Buffer.from(await icon.arrayBuffer()).toString('base64')).toBe(LOGO_PNG_BASE64);
  });

  test('Nochmal einrichten: nichts doppelt, Umbenanntes und Verschobenes bleibt, Fremdes bleibt, alte eigene Sprachkanäle gehen', async () => {
    const roles = dc.guild.roles.size;
    const channels = dc.guild.channels.size;
    const rulesBefore = messagesIn('📜・regeln').length;
    // Philip ändert in Discord: Kanal umbenannt, eigene Rechte für jemanden, VIP und Media getauscht, eigener Kanal.
    const chat = channelByName('💬・chat');
    if (chat) chat.name = 'plauderecke';
    chat?.permission_overwrites?.push({ id: '4242', type: 1, allow: VIEW.toString(), deny: '0' });
    const vip = roleByName('★ VIP');
    const media = roleByName('▶ Media');
    if (vip && media) [vip.position, media.position] = [media.position, vip.position];
    dc.guild.channels.set('4343', { id: '4343', name: 'philips-ecke', type: 0 });
    // Ein Sprachkanal weniger in den Einstellungen.
    const voice = (h.mm.stores.settings('voice')['channels'] as string[]).slice(0, -1);
    h.mm.stores.patchSettings('voice', { channels: voice }, 'test');

    const { progress } = await setup();
    expect(progress.error).toBeNull();
    expect(dc.guild.roles.size).toBe(roles);
    expect(dc.guild.channels.size).toBe(channels); // minus alter Sprachkanal, plus Philips eigener
    expect(messagesIn('📜・regeln').length).toBe(rulesBefore);
    expect(channelByName('plauderecke')).toBeTruthy();
    expect(channelByName('💬・chat')).toBeUndefined();
    expect(progress.report?.kept).toContain('plauderecke');
    expect(channelByName('plauderecke')?.permission_overwrites?.some((o) => o.id === '4242')).toBe(true);
    expect((roleByName('★ VIP')?.position ?? 0) > (roleByName('▶ Media')?.position ?? 0)).toBe(true);
    expect(channelByName('philips-ecke')).toBeTruthy();
    expect(channelByName('Turnier')).toBeUndefined();
    expect(progress.report?.icon).toBe('unchanged');
  });

  test('Regeln im Panel geändert → Regeln in Discord ziehen nach', async () => {
    h.mm.stores.patchSettings('website', { rulesDe: 'Sei nett.\nKein Cheaten.' }, 'test');
    await until(() => JSON.stringify(messagesIn('📜・regeln')).includes('Sei nett.'));
    expect(messagesIn('📜・regeln').length).toBe(1);
  });

  test('Konto verbinden: Code im Spiel, /verbinden in Discord, Rang kommt mit', async () => {
    await proxy.request({ t: 'login', uuid: LENA, name: 'Lena', locale: 'de_de', bedrock: false });
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    h.mm.hub.players.setRole(LENA, 'vip');
    const invite = proxy.next('msg', (m) => String(m['text']).includes('Discord beitreten'));
    await proxy.request({ t: 'command', uuid: LENA, command: 'discord', args: [] });
    // Erst die Einladung zum Anklicken (die der Bot beim Einrichten angelegt hat), dann der Code.
    expect(String((await invite)['text'])).toContain("<click:open_url:'https://discord.gg/");
    const msg = await proxy.next('msg', (m) => String(m['text']).includes('/verbinden'));
    // Code in der Nachricht: "<bold>AB12CD</bold>" → "AB12CD"; "<bold>ab</bold>" nicht.
    // https://regex101.com/?flavor=javascript&regex=%3Cbold%3E(%5BA-Z0-9%5D%7B6%7D)%3C%5C%2Fbold%3E&testString=%3Cbold%3EAB12CD%3C%2Fbold%3E
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

  test(
    'Strafen gelten auch in Discord: Timeout, Stumm-Rolle, Gefängnis nur mit Gefängnis-Rolle, Bann, Strafen-Log',
    async () => {
      const punishLog = () => JSON.stringify(messagesIn('⚖・strafen-log'));
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

      // Gefängnis: nur noch „⛓ Gefängnis“ (Rang-Rollen weg, sonst sähe sie deren Kanäle), danach alles zurück.
      const jailRole = roleByName('⛓ Gefängnis')?.id ?? '-';
      const mediaRole = roleByName('▶ Media')?.id ?? '-';
      await call('POST', '/api/panel/punishments', {
        player: 'Lena',
        kind: 'jail',
        minutes: 15,
        reason: 'Beleidigung',
      });
      // Rolle dazu und Rang-Rollen weg sind zwei Schritte – unter Last kann dazwischen eine Weile vergehen.
      await until(() => JSON.stringify(dc.guild.members.get(LENA_DC)?.roles) === JSON.stringify([jailRole]));
      await call('DELETE', `/api/panel/punishments/${LENA}/jail`);
      await until(() => !dc.guild.members.get(LENA_DC)?.roles.includes(jailRole));
      await until(() => Boolean(dc.guild.members.get(LENA_DC)?.roles.includes(mediaRole)));

      await call('POST', '/api/panel/punishments', {
        player: 'Lena',
        kind: 'ban',
        minutes: 60,
        reason: 'Hacks',
      });
      await until(() => dc.guild.bans.has(LENA_DC));
      await call('DELETE', `/api/panel/punishments/${LENA}/ban`);
      await until(() => !dc.guild.bans.has(LENA_DC));
      await until(() => punishLog().includes('entbannt'));
      await until(() => ['Hacks', 'Gefängnis', 'Beleidigung'].every((part) => punishLog().includes(part)));
      dc.guild.members.set(LENA_DC, { roles: [], communication_disabled_until: null });
    },
    SLOW_TEST_MS,
  );

  test(
    'Sprachchat-Stumm: im Discord-Sprachkanal stumm, auch beim späteren Betreten; ohne Recht nur im Spiel',
    async () => {
      const OK = 200;
      const MINUTES = 30;
      const SHORT = 10;
      const SECOND_LIFT = 2;
      const log = (): string => JSON.stringify(messagesIn('⚖・strafen-log'));
      const times = (part: string): number => log().split(part).length - 1;
      const dorf = channelByName('Dorfplatz')?.id ?? '-';
      // Nach dem Bann im Test davor ist Lena wieder auf dem Server – diesmal im Sprachkanal Dorfplatz.
      dc.guild.members.set(LENA_DC, {
        roles: [],
        communication_disabled_until: null,
        channel_id: dorf,
        mute: false,
      });
      const lena = () => dc.guild.members.get(LENA_DC);
      const sits = (channel: string | null) => {
        Object.assign(lena() ?? {}, { channel_id: channel });
      };
      // Was Discord dem Bot schickt, wenn jemand einen Sprachkanal betritt.
      const enters = () =>
        h.mm.bot.handle({
          t: 'VOICE_STATE_UPDATE',
          d: { guild_id: dc.guild.id, user_id: LENA_DC, channel_id: dorf, mute: lena()?.mute === true },
        });
      const voice = (reason: string, minutes: number | null) =>
        call('POST', '/api/panel/punishments', { player: 'Lena', kind: 'voice', minutes, reason });
      const lift = () => call('DELETE', `/api/panel/punishments/${LENA}/voice`);

      // Sitzt im Sprachkanal: dort gleich stumm, Team-Log; Aufheben gibt sie wieder frei.
      expect((await voice('Schreien', MINUTES)).statusCode).toBe(OK);
      await until(() => lena()?.mute === true);
      await until(() => log().includes('Schreien'));
      expect(log()).toContain('im Sprachchat stumm');
      await lift();
      await until(() => lena()?.mute === false);
      await until(() => times('wieder sprechen') === 1);
      // Ist die Zeit um (hier: ohne Nachricht beendet), hebt das regelmäßige Aufräumen die Stummschaltung auf.
      await voice('Abgelaufen', MINUTES);
      await until(() => lena()?.mute === true);
      h.mm.hub.punish.revoke(LENA, 'voice', 'test');
      await h.mm.bot.cleanup();
      await until(() => lena()?.mute === false);

      // Nicht im Sprachkanal: kein Fehler – stumm, sobald sie einen betritt.
      sits(null);
      await voice('Dauerlärm', null);
      await until(() => log().includes('Dauerlärm'));
      expect(lena()?.mute).toBe(false);
      sits(dorf);
      await enters();
      await until(() => lena()?.mute === true);
      // Aufgehoben, während sie weg ist: beim nächsten Betreten wieder frei.
      sits(null);
      await lift();
      await until(() => times('wieder sprechen') === SECOND_LIFT);
      expect(lena()?.mute).toBe(true);
      sits(dorf);
      await enters();
      await until(() => lena()?.mute === false);

      // Ohne das Recht „Mitglieder stummschalten“: gilt nur im Spiel, Hinweis im Team-Log, kein Fehler.
      dc.permissions.muteMembers = false;
      expect((await voice('Ohne Recht', SHORT)).statusCode).toBe(OK);
      await until(() => log().includes('Ohne Recht'));
      expect(log()).toContain('Mitglieder stummschalten');
      expect(lena()?.mute).toBe(false);
      expect(h.mm.hub.punish.active(LENA, 'voice')).toBeTruthy();
      dc.permissions.muteMembers = true;
      await lift();
    },
    SLOW_TEST_MS,
  );

  test('MorniCraft-Bewerbung: Auswahl bei /bewerben, Formular, Eingang, Annehmen per Knopf, Webseite mit Discord-Anmeldung, Whitelist', async () => {
    const PHILIP_UUID = '11111111-1111-1111-1111-111111111111';
    const PHILIP_DC = '6666';
    const lastReply = () => dc.replies.at(-1)?.body;
    const field = (custom_id: string, value: string) => ({ type: 1, components: [{ custom_id, value }] });
    const intake = () => messagesIn('📥・bewerbungs-eingang');

    // /bewerben zeigt die Auswahl (Team-Stellen + MorniCraft); MorniCraft gewählt → das Formular.
    await interaction(2, { name: 'bewerben' });
    expect(JSON.stringify(lastReply())).toContain('mm:apply:pick');
    expect(JSON.stringify(lastReply())).toContain('mornicraft');
    await interaction(3, { custom_id: 'mm:apply:pick', component_type: 3, values: ['mornicraft'] });
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
    await until(() => intake().length > 0);
    const posted = intake()[0] as unknown as {
      embeds: Array<{ title: string }>;
      components: Array<{ components: Array<{ custom_id: string }> }>;
    };
    expect(posted.embeds[0]?.title).toContain('Lena_Baut');
    const accept = posted.components[0]?.components[0]?.custom_id ?? '';
    // Knopf „Annehmen“: "mm:app-accept:3" ja, "mm:app-reject:3" nein.
    // https://regex101.com/?flavor=javascript&regex=%5Emm%3Aapp-accept%3A%5Cd%2B%24&testString=mm%3Aapp-accept%3A3
    expect(accept).toMatch(/^mm:app-accept:\d+$/);

    // Lena selbst darf nicht entscheiden.
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
    const list = (await call('GET', '/api/panel/whitelist')).json<Array<{ displayName: string }>>();
    expect(list.map((w) => w.displayName)).toEqual(['Lena_Baut']);

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
    const sent = await web('POST', '/api/public/apply', session, {
      minecraftName: 'Lena_Zwei',
      answers: { about: 'Mein Zweitkonto zum Bauen und Ausprobieren.', why: 'Zum Testen.' },
    });
    expect(sent.json()).toMatchObject({ status: 'pending', minecraftName: 'Lena_Zwei' });
    // Die MorniCraft-Karte zeigt nur MorniCraft (keine Team-Bewerbungen).
    const pending = (await call('GET', '/api/panel/applications?status=pending')).json<
      Array<{ id: number; mode: string }>
    >();
    expect(pending.map((a) => a.mode)).toEqual(['mornicraft']);
    const no = await call('POST', `/api/panel/applications/${pending[0]?.id}/decide`, {
      accept: false,
      note: 'Ein Konto reicht.',
    });
    expect(no.json()).toMatchObject({ status: 'rejected', decidedBy: 'philip' });
    await until(() => JSON.stringify(dc.messages.get(`8${LENA_DC}`)).includes('Ein Konto reicht.'));
  });

  test('Ticket öffnen (privater Kanal im Ticket-Kanal) und schließen, Begrüßung neuer Mitglieder', async () => {
    dc.guild.members.set(LENA_DC, { roles: [], communication_disabled_until: null });
    await interaction(3, { custom_id: 'mm:ticket:open' });
    const thread = [...dc.guild.channels.values()].find((c) => c.name.startsWith('Ticket – lena_dc'));
    expect(thread).toMatchObject({
      type: 12,
      members: [LENA_DC],
      parent_id: channelByName('🎫・tickets')?.id,
    });
    expect(JSON.stringify(dc.messages.get(thread?.id ?? ''))).toContain('mm:ticket:close');
    await interaction(3, { custom_id: 'mm:ticket:close' }, { channel_id: thread?.id });
    expect(thread).toMatchObject({ archived: true, locked: true });

    await h.mm.bot.handle({ t: 'GUILD_MEMBER_ADD', d: { guild_id: dc.guild.id, user: { id: '6666' } } });
    expect(JSON.stringify(messagesIn('👋・willkommen'))).toContain('<@6666>');
  });
});
