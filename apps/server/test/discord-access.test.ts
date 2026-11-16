/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { storedSecrets } from '../src/db/schema.js';
import { LOGO_PNG_BASE64 } from '../src/discord/logo.js';
import { FAKE_CLIENT_SECRET, FAKE_TOKENS, startFakeDiscord, type FakeDiscord } from './fake-discord.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';
import { until } from './wait.js';

type Session = { cookie: string; csrf: string };
interface Status {
  configured: boolean;
  connected: boolean;
  bot: { id: string; name: string } | null;
  guild: { id: string } | null;
  credentials: {
    token: { set: boolean; source: string | null };
    clientSecret: { set: boolean; source: string | null };
  };
  canEditAccess: boolean;
}
interface Appearance {
  guild: {
    icon: string | null;
    iconIsLogo: boolean;
    banner: string | null;
    animatedIcon: boolean;
    banners: boolean;
  } | null;
  bot: { name: string; avatar: string | null; avatarIsLogo: boolean } | null;
}

/** Ein winziges echtes PNG (1 × 1, grün) und ein bewegtes GIF (zwei Bilder) als data-URI. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const GIF_TWO_FRAMES = `data:image/gif;base64,${Buffer.concat([
  Buffer.from('474946383961010001008000000000ffffff', 'hex'),
  Buffer.from('21f904000a0000002c00000000010001000002024401', 'hex'),
  Buffer.from('21f904000a0000002c00000000010001000002024401', 'hex'),
  Buffer.from('3b', 'hex'),
]).toString('base64')}`;

describe('Discord im Panel: Zugang und Aussehen', () => {
  let h: Harness;
  let dc: FakeDiscord;
  let owner: Session;
  let admin: Session;
  const call = (session: Session, method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: object) =>
    h.mm.app.inject({
      method,
      url,
      payload,
      headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
    });
  const status = async (): Promise<Status> => (await call(owner, 'GET', '/api/panel/discord')).json<Status>();
  const look = async (): Promise<Appearance> =>
    (await call(owner, 'GET', '/api/panel/discord/appearance')).json<Appearance>();

  beforeAll(async () => {
    dc = await startFakeDiscord();
    h = await createHarness({ env: { MM_DISCORD_API: dc.api, MM_DISCORD_CDN: dc.cdn } });
    owner = await h.login('philip', OWNER_PASSWORD);
    const created = await call(owner, 'POST', '/api/panel/team', { username: 'anna', roleId: 'admin' });
    admin = await h.login('anna', created.json<{ password: string }>().password);
    h.mm.bot.start();
  }, 60_000);
  afterAll(async () => {
    await h.cleanup();
    await dc.close();
  });

  test('Ohne Token: nichts verbunden, Einrichten sagt freundlich warum', async () => {
    const s = await status();
    expect(s).toMatchObject({ configured: false, canEditAccess: true });
    expect(s.credentials.token).toEqual({ set: false, source: null });
    const setup = await call(owner, 'POST', '/api/panel/discord/setup');
    expect(setup.json()).toEqual({ error: 'discord_not_configured' });
  });

  test('Token im Panel: falsche Form, falscher Token, nur der Owner – dann geprüft, versiegelt gespeichert, sofort verbunden', async () => {
    expect((await call(owner, 'PUT', '/api/panel/discord/token', { token: 'kein-token' })).statusCode).toBe(
      400,
    );
    const shape = await call(owner, 'PUT', '/api/panel/discord/token', { token: `${'x'.repeat(60)}` });
    expect(shape.json()).toEqual({ error: 'discord_token_format' });
    const wrong = await call(owner, 'PUT', '/api/panel/discord/token', {
      token: 'erfunden_kein_bot_token_x.abcdef.dies_ist_kein_echter_token_0000000000000',
    });
    expect(wrong.json()).toEqual({ error: 'discord_token_invalid' });
    // Admin sieht Discord, den Token setzt aber nur der Owner.
    const notOwner = await call(admin, 'PUT', '/api/panel/discord/token', { token: FAKE_TOKENS.main });
    expect(notOwner.json()).toEqual({ error: 'discord_owner_only' });
    expect((await call(admin, 'GET', '/api/panel/discord')).json<Status>().canEditAccess).toBe(false);

    const ok = await call(owner, 'PUT', '/api/panel/discord/token', { token: FAKE_TOKENS.main });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ bot: { id: '777', name: 'MoinMorni' } });
    // Gespeichert nur versiegelt, nie im Klartext – und keine Antwort verrät ihn.
    const row = h.mm.db.select().from(storedSecrets).where(eq(storedSecrets.key, 'discord.token')).get();
    expect(row?.value.startsWith('v1:')).toBe(true);
    expect(row?.value).not.toContain(FAKE_TOKENS.main);
    expect(ok.body).not.toContain(FAKE_TOKENS.main);
    await until(() => dc.identified() > 0);
    await until(async () => (await status()).connected);
    const s = await status();
    expect(s.credentials.token).toEqual({ set: true, source: 'panel' });
    expect(JSON.stringify(s)).not.toContain(FAKE_TOKENS.main);
    await until(async () => (await status()).guild !== null);
  });

  test('Client-Secret: falsches abgelehnt, richtiges geprüft – dann geht „Mit Discord anmelden“', async () => {
    expect((await h.mm.app.inject({ method: 'GET', url: '/api/public/apply' })).json()).toMatchObject({
      discordLogin: false,
    });
    const wrong = await call(owner, 'PUT', '/api/panel/discord/client-secret', {
      secret: 'falsches_geheimnis_123',
    });
    expect(wrong.json()).toEqual({ error: 'discord_secret_invalid' });
    const ok = await call(owner, 'PUT', '/api/panel/discord/client-secret', { secret: FAKE_CLIENT_SECRET });
    expect(ok.statusCode).toBe(200);
    expect((await status()).credentials.clientSecret).toEqual({ set: true, source: 'panel' });
    expect((await h.mm.app.inject({ method: 'GET', url: '/api/public/apply' })).json()).toMatchObject({
      discordLogin: true,
    });
  });

  test('Aussehen: Logo als Server-Symbol und Profilbild, eigenes Bild, zurück aufs Logo', async () => {
    // Profilbild: Der Bot hatte keins → einmal das Logo (nicht bei jedem Start).
    await until(() => dc.bots.main.avatar !== null);
    const patches = () =>
      dc.requests.filter((r) => r.method === 'PATCH' && r.path.endsWith('/users/@me')).length;
    const once = patches();
    h.mm.bot.reconnect();
    await until(() => dc.identified() > 1);
    await new Promise((r) => setTimeout(r, 300));
    expect(patches()).toBe(once);

    expect(
      (await call(owner, 'PUT', '/api/panel/discord/appearance/icon', { image: 'logo' })).statusCode,
    ).toBe(200);
    const first = await look();
    expect(first.guild).toMatchObject({ iconIsLogo: true, banners: false, animatedIcon: false });
    expect(first.bot).toMatchObject({ name: 'MoinMorni', avatarIsLogo: true });
    const picture = await fetch(String(first.guild?.icon));
    expect(Buffer.from(await picture.arrayBuffer()).toString('base64')).toBe(LOGO_PNG_BASE64);

    const own = await call(owner, 'PUT', '/api/panel/discord/appearance/icon', { image: PNG });
    expect(own.json<Appearance>().guild).toMatchObject({ iconIsLogo: false });
    // Einrichten lässt ein eigenes Bild stehen.
    const report = await h.mm.bot.setup();
    expect(report.icon).toBe('kept');
    expect((await look()).guild?.iconIsLogo).toBe(false);
    await call(owner, 'PUT', '/api/panel/discord/appearance/icon', { image: 'logo' });
    expect((await look()).guild?.iconIsLogo).toBe(true);
  });

  test('Aussehen: bewegtes Bild und Banner nur mit Boost, kaputtes Bild, fehlende Rechte – freundliche Fehler', async () => {
    const animated = await call(owner, 'PUT', '/api/panel/discord/appearance/icon', {
      image: GIF_TWO_FRAMES,
    });
    expect(animated.json()).toEqual({ error: 'discord_animated_needs_boost' });
    const banner = await call(owner, 'PUT', '/api/panel/discord/appearance/banner', { image: PNG });
    expect(banner.json()).toEqual({ error: 'discord_banner_needs_boost' });
    const broken = await call(owner, 'PUT', '/api/panel/discord/appearance/icon', {
      image: 'data:image/png;base64,SGFsbG8=',
    });
    expect(broken.json()).toEqual({ error: 'discord_image_invalid' });

    // Boost: bewegtes Symbol und Banner gehen.
    dc.guild.features.push('ANIMATED_ICON', 'BANNER');
    dc.guild.premium_tier = 2;
    expect(
      (await call(owner, 'PUT', '/api/panel/discord/appearance/icon', { image: GIF_TWO_FRAMES })).statusCode,
    ).toBe(200);
    expect(dc.guild.icon?.startsWith('a_')).toBe(true);
    const withBanner = await call(owner, 'PUT', '/api/panel/discord/appearance/banner', { image: PNG });
    expect(withBanner.json<Appearance>().guild?.banner).toContain('/banners/');
    const removed = await call(owner, 'PUT', '/api/panel/discord/appearance/banner', { image: null });
    expect(removed.json<Appearance>().guild?.banner).toBeNull();

    // Ohne „Server verwalten“ (Bot mit alter, zu knapper Einladung).
    const before = dc.botRole().permissions;
    dc.setBotPermissions(1n << 10n);
    const denied = await call(owner, 'PUT', '/api/panel/discord/appearance/icon', { image: 'logo' });
    expect(denied.json()).toEqual({ error: 'discord_missing_permissions' });
    dc.setBotPermissions(BigInt(before));
  });

  test('Name und Profilbild des Bots: ändern, ungültiger Name, Discord sperrt zu häufiges Ändern', async () => {
    const renamed = await call(owner, 'PUT', '/api/panel/discord/appearance/bot', { name: 'Morni-Bot' });
    expect(renamed.json<Appearance>().bot?.name).toBe('Morni-Bot');
    expect(dc.bots.main.username).toBe('Morni-Bot');
    const bad = await call(owner, 'PUT', '/api/panel/discord/appearance/bot', { name: 'Moin#Morni' });
    expect(bad.json()).toEqual({ error: 'discord_name_invalid' });
    const avatar = await call(owner, 'PUT', '/api/panel/discord/appearance/bot', { avatar: PNG });
    expect(avatar.json<Appearance>().bot?.avatarIsLogo).toBe(false);
    // Discord: „du änderst dein Profilbild zu schnell“ – länger als der Bot warten mag.
    // Profil des Bots ändern: "/users/@me" ja, "/users/@me/channels" nein.
    // https://regex101.com/?flavor=javascript&regex=%5E%5C%2Fusers%5C%2F%40me%24&testString=%2Fusers%2F%40me
    dc.limit('PATCH', /^\/users\/@me$/, 1, 1800);
    const limited = await call(owner, 'PUT', '/api/panel/discord/appearance/bot', { avatar: 'logo' });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: 'discord_rate_limited' });
    const back = await call(owner, 'PUT', '/api/panel/discord/appearance/bot', { avatar: 'logo' });
    expect(back.json<Appearance>().bot?.avatarIsLogo).toBe(true);
  });

  test('Anderer Bot (neuer Token einer anderen Anwendung): verbindet sich neu und hängt am Server, auf den er geholt wird', async () => {
    const ok = await call(owner, 'PUT', '/api/panel/discord/token', { token: FAKE_TOKENS.other });
    expect(ok.json()).toMatchObject({ bot: { id: '888', name: 'Zweitbot' } });
    await until(async () => (await status()).bot?.id === '888');
    await until(async () => (await status()).guild !== null);
    expect((await call(owner, 'DELETE', '/api/panel/discord/token')).statusCode).toBe(200);
    expect(await status()).toMatchObject({ configured: false });
  });
});

describe('Discord: Werte aus der .env gelten vor dem Panel', () => {
  let h: Harness;
  let dc: FakeDiscord;
  let owner: Session;

  beforeAll(async () => {
    dc = await startFakeDiscord();
    h = await createHarness({
      env: {
        MM_DISCORD_TOKEN: FAKE_TOKENS.main,
        MM_DISCORD_API: dc.api,
        MM_DISCORD_CLIENT_SECRET: FAKE_CLIENT_SECRET,
      },
    });
    owner = await h.login('philip', OWNER_PASSWORD);
  }, 60_000);
  afterAll(async () => {
    await h.cleanup();
    await dc.close();
  });

  test('Panel zeigt „aus der .env“ und lässt den Wert in Ruhe', async () => {
    const headers = { cookie: owner.cookie, 'x-csrf-token': owner.csrf };
    const s = (await h.mm.app.inject({ method: 'GET', url: '/api/panel/discord', headers })).json<Status>();
    expect(s.credentials).toEqual({
      token: { set: true, source: 'env' },
      clientSecret: { set: true, source: 'env' },
    });
    const put = await h.mm.app.inject({
      method: 'PUT',
      url: '/api/panel/discord/token',
      headers,
      payload: { token: FAKE_TOKENS.other },
    });
    expect(put.json()).toEqual({ error: 'discord_credential_from_env' });
    const del = await h.mm.app.inject({ method: 'DELETE', url: '/api/panel/discord/client-secret', headers });
    expect(del.json()).toEqual({ error: 'discord_credential_from_env' });
  });
});
