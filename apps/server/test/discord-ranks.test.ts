/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Role } from '@moinmorni/shared';
import { rankIconOf } from '../src/discord/rank-icons.js';
import { FAKE_TOKENS, startFakeDiscord, type FakeDiscord } from './fake-discord.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';
import { until } from './wait.js';

const VIEW = 1n << 10n;
// Eine einzelne Rolle ändern: "/api/v10/guilds/900/roles/1005" ja, "/api/v10/guilds/900/roles" (Reihenfolge) nein.
// https://regex101.com/?flavor=javascript&regex=%5C%2Froles%5C%2F%5Cd%2B%24&testString=%2Fapi%2Fv10%2Fguilds%2F900%2Froles%2F1005
const ROLE_PATH = /\/roles\/\d+$/;
const QUIET_MS = 2000;

interface Ranks {
  look: 'icons' | 'names';
  reason: 'boost' | 'badges_off' | null;
  icons: number;
  iconsKept: string[];
}
interface Progress {
  running: boolean;
  error: string | null;
  report: { ranks: Ranks } | null;
}
interface Look {
  guild: { roleIcons: boolean; premiumTier: number } | null;
  ranks: {
    look: string;
    reason: string | null;
    roles: Array<{ id: string; discordName: string; icon: boolean; inDiscord: boolean }>;
  } | null;
}

/** Bild eines Rollen-Symbols vom Bilder-Server (nachgebautes Discord). */
async function iconBytes(dc: FakeDiscord, roleId: string, hash: string): Promise<Buffer> {
  const res = await fetch(`${dc.cdn}/role-icons/${roleId}/${hash}.png`);
  expect(res.status).toBe(200);
  return Buffer.from(await res.arrayBuffer());
}

describe('Ränge in Discord wie im Spiel: Farbe, Abzeichen als Rollen-Symbol, Änderungen im Panel', () => {
  let h: Harness;
  let dc: FakeDiscord;
  let owner: { cookie: string; csrf: string };
  const call = (method: 'GET' | 'PUT' | 'POST', url: string, payload?: unknown) =>
    h.mm.app.inject({
      method,
      url,
      payload: payload as object,
      headers: { cookie: owner.cookie, 'x-csrf-token': owner.csrf },
    });
  const roleByName = (name: string) => [...dc.guild.roles.values()].find((r) => r.name === name);
  const roles = async (): Promise<Role[]> => (await call('GET', '/api/panel/roles')).json<Role[]>();
  const saveRoles = async (list: Role[]): Promise<void> => {
    const res = await call('PUT', '/api/panel/roles', list);
    expect(res.statusCode, res.body).toBe(200);
  };
  const look = async (): Promise<Look> => (await call('GET', '/api/panel/discord/appearance')).json<Look>();
  /** Wie oft der Bot ein Rollen-Symbol schicken wollte (Bild oder entfernen). */
  const iconRequests = (): number =>
    dc.requests.filter((r) => r.method === 'PATCH' && ROLE_PATH.test(r.path) && r.body.includes('"icon"'))
      .length;
  const setup = async (): Promise<Progress> => {
    expect((await call('POST', '/api/panel/discord/setup')).statusCode).toBe(200);
    await until(
      async () => !(await call('GET', '/api/panel/discord')).json<{ setup: Progress }>().setup.running,
    );
    return (await call('GET', '/api/panel/discord')).json<{ setup: Progress }>().setup;
  };
  /**
   * Warten, bis der Bot fertig ist: Er überträgt Änderungen kurz verzögert (1,5 s) und dann Rolle für Rolle – fertig,
   * wenn Discord 2 Sekunden lang nichts mehr von ihm hört.
   */
  const settle = async (): Promise<void> => {
    const seen = { count: -1, since: Date.now() };
    await until(() => {
      if (dc.requests.length !== seen.count) {
        seen.count = dc.requests.length;
        seen.since = Date.now();
      }
      return Date.now() - seen.since >= QUIET_MS;
    }, 20_000);
  };
  /** Boost-Stufe des Servers ändern – Discord meldet das dem Bot als GUILD_UPDATE. */
  const boost = (tier: number): void => {
    dc.guild.premium_tier = tier;
    dc.guild.features =
      tier >= 2
        ? [...new Set([...dc.guild.features, 'ROLE_ICONS'])]
        : dc.guild.features.filter((f) => f !== 'ROLE_ICONS');
    dc.dispatch('GUILD_UPDATE', { id: dc.guild.id, name: dc.guild.name, features: dc.guild.features });
  };

  beforeAll(async () => {
    dc = await startFakeDiscord();
    h = await createHarness({
      env: { MM_DISCORD_TOKEN: FAKE_TOKENS.main, MM_DISCORD_API: dc.api, MM_DISCORD_CDN: dc.cdn },
    });
    owner = await h.login('philip', OWNER_PASSWORD);
    h.mm.bot.start();
    await until(
      async () => (await call('GET', '/api/panel/discord')).json<{ guild: unknown }>().guild !== null,
    );
  }, 60_000);
  afterAll(async () => {
    await h.cleanup();
    await dc.close();
  });

  test('Ohne Boost: Symbol im Namen, Farbe der Ränge, kein Versuch mit Rollen-Symbolen – und das Panel sagt warum', async () => {
    const progress = await setup();
    expect(progress.error).toBeNull();
    expect(progress.report?.ranks).toEqual({ look: 'names', reason: 'boost', icons: 0, iconsKept: [] });
    expect(roleByName('♛ Owner')).toMatchObject({ color: 0xff5555, icon: null });
    expect(roleByName('✚ Supporter')).toMatchObject({ color: 0x22c55e, icon: null });
    expect(roleByName('⚔ Moderator')).toBeTruthy();
    expect(iconRequests()).toBe(0);
    const l = await look();
    expect(l.guild).toMatchObject({ roleIcons: false, premiumTier: 0 });
    expect(l.ranks).toMatchObject({ look: 'names', reason: 'boost' });
    // Das Panel zeigt jeden Rang so, wie er in Discord heißt – beste zuerst, ohne „Spieler“.
    expect(l.ranks?.roles.map((r) => r.discordName).slice(0, 4)).toEqual([
      '♛ Owner',
      '✦ Admin',
      '⚔ Moderator',
      '✚ Supporter',
    ]);
    expect(l.ranks?.roles.every((r) => r.inDiscord && !r.icon)).toBe(true);
    expect(l.ranks?.roles.some((r) => r.id === 'player')).toBe(false);
  });

  test('Rolle im Panel geändert oder neu: Discord zieht von selbst nach – Name, Farbe, neue Rolle mit ihren Kanälen', async () => {
    const list = await roles();
    const media = list.find((r) => r.id === 'media');
    if (!media) throw new Error('media fehlt');
    const changed = list.map((r) =>
      r.id === 'media' ? { ...r, name: { de: 'Presse', en: 'Press' }, colour: '#f472b6' } : r,
    );
    const helper: Role = {
      ...media,
      id: 'helfer',
      name: { de: 'Helfer', en: 'Helper' },
      symbol: '❤',
      colour: '#ef4444',
      panel: ['overview'],
      discord: ['team-area'],
      position: Math.max(...list.map((r) => r.position).filter((p) => p < 90)) + 1,
      fallback: false,
    };
    await saveRoles([...changed, helper]);
    await until(() => Boolean(roleByName('❤ Helfer')) && Boolean(roleByName('▶ Presse')), 10_000);
    await settle();
    expect(roleByName('▶ Media')).toBeUndefined();
    expect(roleByName('▶ Presse')).toMatchObject({ color: 0xf472b6 });
    expect(roleByName('❤ Helfer')).toMatchObject({ color: 0xef4444, mentionable: true });
    // Die neue Team-Rolle sieht die Team-Kanäle – ohne „Server einrichten“.
    const teamChat = [...dc.guild.channels.values()].find((c) => c.name === '🛡・team-chat');
    const ow = teamChat?.permission_overwrites?.find((o) => o.id === roleByName('❤ Helfer')?.id);
    expect(BigInt(ow?.allow ?? '0') & VIEW).toBe(VIEW);
    // Unter dem Bot, über den Rollen neben den Rängen.
    expect(roleByName('❤ Helfer')?.position ?? 0).toBeGreaterThan(roleByName('🤖 Bot')?.position ?? 99);
    expect(roleByName('❤ Helfer')?.position ?? 99).toBeLessThan(dc.botRole().position);
    expect(iconRequests()).toBe(0);
  });

  test('Boost-Stufe 2: jeder Rang bekommt sein Abzeichen als Rollen-Symbol, der Name steht ohne Symbol daneben', async () => {
    boost(2);
    await until(() => Boolean(roleByName('Owner')?.icon) && Boolean(roleByName('Helfer')?.icon), 10_000);
    await settle();
    const list = await roles();
    const expected = list.filter((r) => !r.fallback);
    expected.forEach((r) => {
      const role = roleByName(r.name.de);
      expect(role, r.name.de).toBeTruthy();
      expect(role?.icon, r.name.de).toBeTruthy();
    });
    expect(roleByName('♛ Owner')).toBeUndefined();
    // Das Bild ist genau die Kachel des Rangs (Krone, Rangfarbe, goldener Rahmen), 108 × 108 Pixel.
    const supporter = roleByName('Supporter');
    const png = await iconBytes(dc, supporter?.id ?? '', supporter?.icon ?? '');
    expect(png.equals(rankIconOf({ symbol: '✚', colour: '#22c55e' })?.png ?? Buffer.alloc(0))).toBe(true);
    expect(png.readUInt32BE(16)).toBe(108);
    expect(png.readUInt32BE(20)).toBe(108);
    // Rollen neben den Rängen bleiben, wie sie sind.
    expect(roleByName('🤖 Bot')?.icon ?? null).toBeNull();
    expect(roleByName('⛓ Gefängnis')).toBeTruthy();
    const l = await look();
    expect(l.guild).toMatchObject({ roleIcons: true });
    expect(l.ranks).toMatchObject({ look: 'icons', reason: null });
    expect(l.ranks?.roles.find((r) => r.id === 'supporter')).toMatchObject({
      discordName: 'Supporter',
      icon: true,
    });
    // Nochmal einrichten: nichts doppelt hochgeladen.
    const before = iconRequests();
    const again = await setup();
    expect(again.report?.ranks).toMatchObject({ look: 'icons', icons: 0 });
    expect(iconRequests()).toBe(before);
  });

  test('Farbe oder Symbol im Panel geändert → neues Bild; ein Symbol, das jemand in Discord selbst gesetzt hat, bleibt', async () => {
    const supporter = roleByName('Supporter');
    const vip = roleByName('VIP');
    const oldIcon = supporter?.icon;
    // Philip setzt dem VIP in Discord selbst ein Emoji als Symbol.
    if (vip) {
      vip.icon = null;
      vip.unicode_emoji = '💎';
    }
    const list = await roles();
    await saveRoles(list.map((r) => (r.id === 'supporter' ? { ...r, colour: '#16a34a' } : r)));
    await until(() => roleByName('Supporter')?.icon !== oldIcon, 10_000);
    await settle();
    expect(roleByName('Supporter')).toMatchObject({ color: 0x16a34a });
    const png = await iconBytes(dc, supporter?.id ?? '', roleByName('Supporter')?.icon ?? '');
    expect(png.equals(rankIconOf({ symbol: '✚', colour: '#16a34a' })?.png ?? Buffer.alloc(0))).toBe(true);
    expect(roleByName('VIP')).toMatchObject({ unicode_emoji: '💎', icon: null });
  });

  test('Abzeichen im Panel aus → Symbol wieder im Namen, eigene Bilder weg, fremdes Emoji bleibt', async () => {
    h.mm.stores.patchSettings('badges', { enabled: false }, 'test');
    await until(() => Boolean(roleByName('♛ Owner')) && Boolean(roleByName('✚ Supporter')), 10_000);
    await until(() => roleByName('♛ Owner')?.icon === null, 10_000);
    await settle();
    expect(roleByName('✚ Supporter')?.icon).toBeNull();
    expect(roleByName('★ VIP')).toMatchObject({ unicode_emoji: '💎' });
    expect((await look()).ranks).toMatchObject({ look: 'names', reason: 'badges_off' });
    h.mm.stores.patchSettings('badges', { enabled: true }, 'test');
    await until(() => Boolean(roleByName('Owner')?.icon), 10_000);
    await settle();
  });

  test('Boost verloren: Symbol zurück in den Namen, ohne Fehler und ohne Versuch, Bilder zu ändern', async () => {
    const before = iconRequests();
    boost(1);
    await until(() => Boolean(roleByName('♛ Owner')) && Boolean(roleByName('❤ Helfer')), 10_000);
    await settle();
    expect(iconRequests()).toBe(before);
    expect((await look()).ranks).toMatchObject({ look: 'names', reason: 'boost' });
    const again = await setup();
    expect(again.error).toBeNull();
    expect(again.report?.ranks).toMatchObject({ look: 'names', reason: 'boost' });
    expect(iconRequests()).toBe(before);
  });
});
