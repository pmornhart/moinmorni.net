/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { FAKE_CLIENT_SECRET, FAKE_TOKENS, startFakeDiscord, type FakeDiscord } from './fake-discord.js';
import { connectPlugin, type FakePlugin } from './fake-plugin.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';
import { until } from './wait.js';

const LENA = '22222222-2222-2222-2222-222222222222';
const LENA_DC = '5555';
const PHILIP = '11111111-1111-1111-1111-111111111111';
const PHILIP_DC = '6666';
const MAX = '33333333-3333-3333-3333-333333333333';
const MAX_DC = '7777';
const ANNA = '44444444-4444-4444-4444-444444444444';
const STRANGER_DC = '9999';
// Startpasswort: drei Viererblöcke, z. B. "abcd-EFGH-2345".
// https://regex101.com/?flavor=javascript&regex=%5E%5B%5Cw%5D%7B4%7D-%5B%5Cw%5D%7B4%7D-%5B%5Cw%5D%7B4%7D%24&testString=abcd-EFGH-2345
const START_PASSWORD = /^\w{4}-\w{4}-\w{4}$/;

type Session = { cookie: string; csrf: string };
interface Row {
  id: number;
  kind: string;
  position: string | null;
  status: string;
  minecraftName: string;
  votes: { up: number; down: number; mine: number };
  notes: number;
  canDecide: boolean;
}
interface ButtonRow {
  components: Array<{ custom_id?: string; url?: string; type: number; options?: Array<{ value: string }> }>;
}

describe('Team-Bewerbungen', () => {
  let h: Harness;
  let dc: FakeDiscord;
  let owner: Session;
  let anna: Session;
  let max: Session;
  let proxy: FakePlugin;
  const call = (session: Session, method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: object) =>
    h.mm.app.inject({
      method,
      url,
      payload,
      headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
    });
  const web = (method: 'GET' | 'POST', url: string, cookie = '', payload?: object) =>
    h.mm.app.inject({ method, url, payload, headers: cookie ? { cookie } : {} });
  const channelByName = (name: string) => [...dc.guild.channels.values()].find((c) => c.name === name);
  const roleByName = (name: string) => [...dc.guild.roles.values()].find((r) => r.name === name);
  const intake = () => dc.messages.get(channelByName('📥・bewerbungs-eingang')?.id ?? '') ?? [];
  const dms = (discordId: string) => JSON.stringify(dc.messages.get(`8${discordId}`) ?? []);
  const lastReply = () => dc.replies.at(-1)?.body;
  const as = (discordId: string, name: string) => ({ member: { user: { id: discordId, username: name } } });
  const interaction = (type: number, data: Record<string, unknown>, who = as(LENA_DC, 'lena_dc')) =>
    h.mm.bot.handle({
      t: 'INTERACTION_CREATE',
      d: {
        id: `i${Math.random().toString(36).slice(2, 8)}`,
        token: 'tok',
        type,
        locale: 'de',
        data,
        guild_id: dc.guild.id,
        ...who,
      },
    });
  const fields = (values: Record<string, string>) =>
    Object.entries(values).map(([custom_id, value]) => ({ type: 1, components: [{ custom_id, value }] }));
  const modalInputs = () =>
    ((lastReply()?.data['components'] as ButtonRow[] | undefined) ?? []).map(
      (r) => r.components[0]?.custom_id,
    );

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
    const a = await call(owner, 'POST', '/api/panel/team', { username: 'anna', roleId: 'admin' });
    anna = await h.login('anna', a.json<{ password: string }>().password);
    const m = await call(owner, 'POST', '/api/panel/team', { username: 'max', roleId: 'moderator' });
    max = await h.login('max', m.json<{ password: string }>().password);
    h.mm.bot.start();
    const port = await h.mm.hub.listen('127.0.0.1', 0);
    proxy = await connectPlugin(
      `ws://127.0.0.1:${port}/hub`,
      'proxy',
      'proxy',
      h.mm.hub.keyFor('proxy', 'proxy'),
    );
    // Spieler: Philip (Owner), Max (Moderator), Anna (Admin), Lena (noch nicht verbunden).
    const players: Array<[string, string, string | null, string | null]> = [
      [PHILIP, 'Philip', 'owner', PHILIP_DC],
      [MAX, 'Max', 'moderator', MAX_DC],
      [ANNA, 'Anna', 'admin', null],
      [LENA, 'Lena', null, null],
    ];
    players.forEach(([uuid, name, role, discord]) => {
      h.mm.hub.players.seen({ uuid, name, bedrock: false });
      if (role) h.mm.hub.players.setRole(uuid, role);
      if (discord) h.mm.hub.players.setDiscord(uuid, discord);
    });
    [LENA_DC, PHILIP_DC, MAX_DC].forEach((id) =>
      dc.guild.members.set(id, { roles: [], communication_disabled_until: null }),
    );
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

  test('Discord: /bewerben → Stelle wählen; ohne verbundenes Konto erst verbinden; Builder in zwei Schritten; Eingang mit Knöpfen', async () => {
    await interaction(2, { name: 'bewerben' });
    const pick = (lastReply()?.data['components'] as ButtonRow[])[0]?.components[0];
    expect(pick?.custom_id).toBe('mm:apply:pick');
    // Offene Stellen (Admin ist zu) und MorniCraft (Bewerbungen offen).
    expect(pick?.options?.map((o) => o.value)).toEqual(['moderator', 'builder', 'media', 'mornicraft']);

    await interaction(3, { custom_id: 'mm:apply:pick', component_type: 3, values: ['moderator'] });
    expect(JSON.stringify(lastReply())).toContain('Verbinde zuerst dein Minecraft-Konto');

    h.mm.hub.players.setDiscord(LENA, LENA_DC);
    await interaction(3, { custom_id: 'mm:apply:pick', component_type: 3, values: ['builder'] });
    expect(lastReply()).toMatchObject({ type: 9, data: { custom_id: 'mm:team-form:builder:0' } });
    expect(String(lastReply()?.data['title'])).toContain('(1/2)');
    expect(modalInputs()).toEqual(['q0', 'q1', 'q2', 'q3', 'q4']);
    await interaction(5, {
      custom_id: 'mm:team-form:builder:0',
      components: fields({
        q0: '15',
        q1: 'Seit 2019',
        q2: 'Ja, auf einem kleinen Server',
        q3: '10 Stunden',
        q4: 'https://example.org/bauten',
      }),
    });
    const next = (lastReply()?.data['components'] as ButtonRow[])[0]?.components[0]?.custom_id;
    expect(next).toBe('mm:team-next:builder:1');
    await interaction(3, { custom_id: next });
    expect(lastReply()).toMatchObject({ type: 9, data: { custom_id: 'mm:team-form:builder:1' } });
    expect(modalInputs()).toEqual(['q5']);
    await interaction(5, {
      custom_id: 'mm:team-form:builder:1',
      components: fields({ q5: 'Weil ich gern Dörfer baue.' }),
    });
    expect(JSON.stringify(lastReply())).toContain('Deine Bewerbung als **⚒ Builder** ist beim Team');

    await until(() => intake().length > 0);
    const posted = intake()[0] as unknown as {
      embeds: Array<{ title: string; fields: Array<{ name: string; value: string }> }>;
      components: ButtonRow[];
    };
    expect(posted.embeds[0]?.title).toContain('Lena als ⚒ Builder');
    expect(posted.embeds[0]?.fields.map((f) => f.value)).toEqual(
      expect.arrayContaining(['Seit 2019', 'Weil ich gern Dörfer baue.']),
    );
    const buttons = posted.components[0]?.components ?? [];
    expect(buttons.map((b) => b.custom_id ?? b.url)).toEqual([
      expect.stringMatching(/^mm:team-accept:\d+$/), // eslint-disable-line ts-patterns/require-regex-example -- "mm:team-accept:4" ja
      expect.stringMatching(/^mm:team-reject:\d+$/), // eslint-disable-line ts-patterns/require-regex-example -- "mm:team-reject:4" ja
      expect.stringContaining('/panel/bewerbungen/'),
    ]);

    // Eine offene Bewerbung pro Person.
    await interaction(3, { custom_id: 'mm:apply:pick', component_type: 3, values: ['moderator'] });
    expect(JSON.stringify(lastReply())).toContain('liegt noch beim Team');
  });

  test('Discord: Annehmen nur, wer die Rolle vergeben darf – mit Nachricht; Rang im Spiel und in Discord, Direktnachricht, Eingang angepasst', async () => {
    const posted = intake()[0] as unknown as { components: ButtonRow[] };
    const accept = posted.components[0]?.components[0]?.custom_id ?? '';
    const id = Number(accept.split(':').at(-1));
    // Lena selbst und Max (Moderator, ohne „Ränge vergeben“) dürfen nicht.
    await interaction(3, { custom_id: accept });
    expect(JSON.stringify(lastReply())).toContain('darf nur, wer diese Rolle auch vergeben darf');
    await interaction(3, { custom_id: accept }, as(MAX_DC, 'max_dc'));
    expect(JSON.stringify(lastReply())).toContain('darf nur, wer diese Rolle auch vergeben darf');

    await proxy.request({ t: 'login', uuid: LENA, name: 'Lena', locale: 'de_de', bedrock: false });
    proxy.send({ t: 'switch', uuid: LENA, server: 'lobby' });
    await interaction(3, { custom_id: accept }, as(PHILIP_DC, 'philip_dc'));
    expect(lastReply()).toMatchObject({ type: 9, data: { custom_id: `mm:team-decide:accept:${id}` } });
    await interaction(
      5,
      { custom_id: `mm:team-decide:accept:${id}`, components: fields({ note: 'Schön, dass du da bist!' }) },
      as(PHILIP_DC, 'philip_dc'),
    );
    expect(JSON.stringify(lastReply())).toContain('angenommen');
    expect(h.mm.hub.players.roleOf(LENA).id).toBe('builder');
    await until(() =>
      Boolean(dc.guild.members.get(LENA_DC)?.roles.includes(roleByName('⚒ Builder')?.id ?? '-')),
    );
    await until(() => dms(LENA_DC).includes('Willkommen im Team'));
    expect(dms(LENA_DC)).toContain('Schön, dass du da bist!');
    await proxy.next('msg', (m) => m['uuid'] === LENA && String(m['text']).includes('Willkommen im Team'));
    await until(() => !JSON.stringify(intake()[0]).includes('mm:team-accept'));
    expect(JSON.stringify(intake()[0])).toContain('Angenommen von Philip');
  });

  test('Webseite: Stellen, Anmeldung mit Discord zurück auf /team/bewerben, Formular, eine offene pro Person', async () => {
    const open = (await web('GET', '/api/public/team-apply')).json<{
      positions: Array<{ id: string }>;
      me: unknown;
      discordLogin: boolean;
    }>();
    expect(open.positions.map((p) => p.id)).toEqual(['moderator', 'builder', 'media']);
    expect(open).toMatchObject({ me: null, discordLogin: true });
    const site = (await web('GET', '/api/site')).json<{ teamSearch: Array<{ id: string }> }>();
    expect(site.teamSearch.map((p) => p.id)).toEqual(['moderator', 'builder', 'media']);

    const login = await web('GET', '/api/public/apply/login?ziel=team');
    const state = new URL(String(login.headers.location)).searchParams.get('state') ?? '';
    const stateCookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
    const back = await web('GET', `/api/public/apply/callback?code=good-code&state=${state}`, stateCookie);
    expect(back.headers.location).toBe('/team/bewerben');
    const session =
      ([] as string[])
        .concat(back.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('mm_apply='))
        ?.split(';')[0] ?? '';
    const me = (await web('GET', '/api/public/team-apply', session)).json<{
      me: unknown;
      applications: Array<{ status: string }>;
    }>();
    expect(me.me).toEqual({ name: 'Lena', minecraft: { name: 'Lena' } });
    expect(me.applications.map((a) => a.status)).toEqual(['accepted']);

    const tooFew = await web('POST', '/api/public/team-apply', session, {
      position: 'moderator',
      answers: ['15'],
      lang: 'de',
    });
    expect(tooFew.json()).toEqual({ error: 'team_apply_answers' });
    const vip = await web('POST', '/api/public/team-apply', session, {
      position: 'vip',
      answers: [],
      lang: 'de',
    });
    expect(vip.statusCode).toBe(400);
    const answers = ['15', 'Seit 2019', 'Ja', '8 Stunden', 'Ich helfe gern.'];
    const sent = await web('POST', '/api/public/team-apply', session, {
      position: 'moderator',
      answers,
      lang: 'de',
    });
    expect(sent.json()).toMatchObject({ position: 'moderator', status: 'pending', minecraftName: 'Lena' });
    const again = await web('POST', '/api/public/team-apply', session, {
      position: 'media',
      answers: ['a', 'b', 'c', 'd', 'e', 'f'],
      lang: 'de',
    });
    expect(again.json()).toEqual({ error: 'team_apply_pending' });
  });

  test('Panel: Liste mit Filter, Notizen und Daumen; Moderator darf keinen Moderator annehmen; Admin nimmt an und legt ein Team-Konto an', async () => {
    const list = (
      await call(owner, 'GET', '/api/panel/applications/all?position=moderator&status=pending')
    ).json<{ applications: Row[] }>();
    expect(list.applications).toHaveLength(1);
    const app = list.applications[0] as Row;
    expect(app).toMatchObject({ kind: 'team', canDecide: true, votes: { up: 0, down: 0, mine: 0 } });

    expect(
      (
        await call(owner, 'POST', `/api/panel/applications/${app.id}/notes`, {
          text: 'Kenne ich aus dem Spiel, sehr hilfsbereit.',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await call(owner, 'PUT', `/api/panel/applications/${app.id}/vote`, { vote: 1 })).json(),
    ).toMatchObject({ up: 1, mine: 1 });
    expect(
      (await call(anna, 'PUT', `/api/panel/applications/${app.id}/vote`, { vote: -1 })).json(),
    ).toMatchObject({ up: 1, down: 1, mine: -1 });
    const detail = (await call(max, 'GET', `/api/panel/applications/${app.id}`)).json<{
      answers: Record<string, string>;
      notesList: Array<{ author: string }>;
      canDecide: boolean;
      voters: unknown[];
    }>();
    expect(detail.answers['Warum gerade du?']).toBe('Ich helfe gern.');
    expect(detail.notesList.map((n) => n.author)).toEqual(['philip']);
    expect(detail.canDecide).toBe(false);
    expect(detail.voters).toHaveLength(2);

    const denied = await call(max, 'POST', `/api/panel/applications/${app.id}/decide`, {
      accept: true,
      note: '',
    });
    expect(denied.json()).toEqual({ error: 'application_no_right' });

    const accepted = await call(anna, 'POST', `/api/panel/applications/${app.id}/decide`, {
      accept: true,
      note: 'Willkommen im Mod-Team!',
      account: { username: 'lena.mod' },
    });
    expect(accepted.statusCode).toBe(200);
    const result = accepted.json<{ status: string; account: { username: string; password: string } }>();
    expect(result.status).toBe('accepted');
    expect(result.account.username).toBe('lena.mod');
    expect(result.account.password).toMatch(START_PASSWORD);
    expect(h.mm.hub.players.roleOf(LENA).id).toBe('moderator');
    const team = (await call(owner, 'GET', '/api/panel/team')).json<
      Array<{ username: string; roleId: string; mustChangePassword: boolean }>
    >();
    expect(team.find((m) => m.username === 'lena.mod')).toMatchObject({
      roleId: 'moderator',
      mustChangePassword: true,
    });
    await until(() => dms(LENA_DC).includes('Zugangsdaten fürs Panel'));
  });

  test('Admin-Stelle: öffnet nur der Owner, annehmen nur der Owner; Absage mit Wartezeit; nie herabstufen', async () => {
    const session = await (async () => {
      const login = await web('GET', '/api/public/apply/login?ziel=team');
      const state = new URL(String(login.headers.location)).searchParams.get('state') ?? '';
      const back = await web(
        'GET',
        `/api/public/apply/callback?code=good-code&state=${state}`,
        String(login.headers['set-cookie']).split(';')[0] ?? '',
      );
      return (
        ([] as string[])
          .concat(back.headers['set-cookie'] ?? [])
          .find((c) => c.startsWith('mm_apply='))
          ?.split(';')[0] ?? ''
      );
    })();
    const six = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(
      (await web('POST', '/api/public/team-apply', session, { position: 'admin', answers: six })).json(),
    ).toEqual({
      error: 'team_apply_closed',
    });
    const notOwner = await call(anna, 'PUT', '/api/panel/settings/team-apply', { adminOpen: true });
    expect(notOwner.json()).toEqual({ error: 'setting_owner_only' });
    expect((await call(owner, 'PUT', '/api/panel/settings/team-apply', { adminOpen: true })).statusCode).toBe(
      200,
    );
    // Die Stelle steht jetzt auch im Bewerbungs-Kanal.
    await until(() =>
      JSON.stringify(dc.messages.get(channelByName('📝・bewerbungen')?.id ?? '')).includes(
        'mm:apply:team:admin',
      ),
    );

    const app = (
      await web('POST', '/api/public/team-apply', session, { position: 'admin', answers: six })
    ).json<{ id: number }>();
    expect(
      (
        await call(anna, 'POST', `/api/panel/applications/${app.id}/decide`, { accept: true, note: '' })
      ).json(),
    ).toEqual({
      error: 'application_no_right',
    });
    const no = await call(owner, 'POST', `/api/panel/applications/${app.id}/decide`, {
      accept: false,
      note: 'Noch etwas zu früh.',
    });
    expect(no.json()).toMatchObject({ status: 'rejected' });
    await until(() => dms(LENA_DC).includes('Noch etwas zu früh.'));
    expect(dms(LENA_DC)).toContain('wieder bewerben');

    // Wartezeit nach der Absage (Vorgabe 14 Tage).
    const wait = await web('POST', '/api/public/team-apply', session, { position: 'media', answers: six });
    expect(wait.json()).toEqual({ error: 'team_apply_cooldown' });
    expect((await web('GET', '/api/public/team-apply', session)).json()).toMatchObject({
      blocked: { code: 'team_apply_cooldown' },
    });
    h.mm.stores.patchSettings('team-apply', { cooldownDays: 0 }, 'test');
    // Lena ist schon Moderator: Media wäre ein Schritt nach unten – wird nicht angenommen.
    const media = (
      await web('POST', '/api/public/team-apply', session, { position: 'media', answers: six })
    ).json<{ id: number }>();
    const down = await call(owner, 'POST', `/api/panel/applications/${media.id}/decide`, {
      accept: true,
      note: '',
    });
    expect(down.json()).toEqual({ error: 'application_rank_not_higher' });
    expect(h.mm.hub.players.roleOf(LENA).id).toBe('moderator');
  });

  test('Ohne Pflicht zur Verbindung: Minecraft-Name selbst schreiben; unbekannter Spieler lässt sich nicht annehmen', async () => {
    h.mm.stores.patchSettings('team-apply', { linkedRequired: false }, 'test');
    const stranger = as(STRANGER_DC, 'neuling');
    await interaction(3, { custom_id: 'mm:apply:team:moderator' }, stranger);
    expect(modalInputs()).toEqual(['minecraft', 'q0', 'q1', 'q2', 'q3']);
    await interaction(
      5,
      {
        custom_id: 'mm:team-form:moderator:0',
        components: fields({ minecraft: 'Neuling_42', q0: '17', q1: '2020', q2: 'Nein', q3: '5h' }),
      },
      stranger,
    );
    await interaction(
      5,
      { custom_id: 'mm:team-form:moderator:1', components: fields({ q4: 'Ich will helfen.' }) },
      stranger,
    );
    expect(JSON.stringify(lastReply())).toContain('ist beim Team');
    const row = (
      await call(owner, 'GET', '/api/panel/applications/all?position=moderator&status=pending')
    ).json<{ applications: Row[] }>().applications[0];
    expect(row?.minecraftName).toBe('Neuling_42');
    const unknown = await call(owner, 'POST', `/api/panel/applications/${row?.id}/decide`, {
      accept: true,
      note: '',
    });
    expect(unknown.json()).toEqual({ error: 'application_player_unknown' });
  });

  test('Im Spiel: /teamsuche – die Admin-Stelle öffnet nur der Owner', async () => {
    await proxy.request({ t: 'login', uuid: ANNA, name: 'Anna', locale: 'de_de', bedrock: false });
    proxy.send({ t: 'switch', uuid: ANNA, server: 'lobby' });
    await proxy.request({ t: 'command', uuid: ANNA, command: 'teamsuche', args: ['admin', 'aus'] });
    await proxy.next(
      'msg',
      (m) => m['uuid'] === ANNA && String(m['text']).includes('Das darfst du leider nicht'),
    );
    expect(h.mm.stores.settings('team-apply')['adminOpen']).toBe(true);
    await proxy.request({ t: 'command', uuid: ANNA, command: 'teamsuche', args: ['media', 'aus'] });
    await until(() => h.mm.stores.settings('team-apply')['mediaOpen'] === false);
  });

  test('Stellen kommen aus den Rollen des Panels: neue Rolle „Supporter“ → Stelle und Discord-Rolle von selbst', async () => {
    const editor = h.mm.stores.role('owner');
    if (!editor) throw new Error('owner fehlt');
    const supporter = {
      id: 'supporter',
      name: { de: 'Supporter', en: 'Supporter' },
      symbol: '✚',
      colour: '#3ddc84',
      panel: ['overview' as const, 'players' as const],
      game: ['warn' as const, 'mute' as const],
      discord: ['tickets' as const, 'team-area' as const],
      position: 3,
      fallback: false,
    };
    const roles = h.mm.stores.roles().map((r) => (r.position >= 3 ? { ...r, position: r.position + 1 } : r));
    h.mm.stores.saveRoles([...roles, supporter], 'test', editor);
    const open = (await web('GET', '/api/public/team-apply')).json<{
      positions: Array<{ id: string; role: { symbol: string } }>;
    }>();
    // Reihenfolge der Ränge; Media ist inzwischen zu, Admin offen.
    expect(open.positions.map((p) => p.id)).toEqual(['admin', 'moderator', 'supporter', 'builder']);
    expect(open.positions.find((p) => p.id === 'supporter')?.role.symbol).toBe('✚');
    await h.mm.bot.setup();
    const position = (name: string) => roleByName(name)?.position ?? -1;
    expect(position('✚ Supporter')).toBeLessThan(position('⚔ Moderator'));
    expect(position('✚ Supporter')).toBeGreaterThan(position('⚒ Builder'));
    await until(() =>
      JSON.stringify(dc.messages.get(channelByName('📝・bewerbungen')?.id ?? '')).includes(
        'mm:apply:team:supporter',
      ),
    );
  });
});
