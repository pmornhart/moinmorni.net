import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';

const LENA = '22222222-2222-2222-2222-222222222222';
const FINN = '33333333-3333-3333-3333-333333333333';
const MIA = '44444444-4444-4444-4444-444444444444';

describe('Webseite: News, Ranglisten, Profile, Team, Regeln', () => {
  let h: Harness;
  let owner: { cookie: string; csrf: string };
  const call = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: object) =>
    h.mm.app.inject({ method, url, payload, headers: { cookie: owner.cookie, 'x-csrf-token': owner.csrf } });
  const anon = (url: string) => h.mm.app.inject({ method: 'GET', url });

  beforeAll(async () => {
    h = await createHarness();
    owner = await h.login('philip', OWNER_PASSWORD);
    h.mm.hub.players.seen({ uuid: LENA, name: 'Lena', bedrock: false });
    h.mm.hub.players.addMinutes(LENA, 300);
    h.mm.hub.players.seen({ uuid: FINN, name: 'Finn', bedrock: false });
    h.mm.hub.players.addMinutes(FINN, 900);
  }, 60_000);
  afterAll(async () => {
    await h.cleanup();
  });

  test('News: Entwurf bleibt im Panel, veröffentlicht steht auf der Webseite', async () => {
    const draft = {
      category: 'update',
      title: { de: 'Neu: Morni Party!', en: '' },
      body: { de: 'Drei Spielfelder, zwölf Minispiele.', en: 'Three boards, twelve minigames.' },
      pinned: false,
      publish: false,
    };
    const created = (await call('POST', '/api/panel/news', draft)).json<{ id: number; slug: string }>();
    expect(created.slug).toBe('neu-morni-party');
    expect((await anon('/api/news')).json()).toEqual([]);
    await call('PUT', `/api/panel/news/${created.id}`, { ...draft, publish: true });
    const list = (await anon('/api/news')).json<Array<{ slug: string; title: { en: string } }>>();
    expect(list).toHaveLength(1);
    expect(list[0]?.title.en).toBe('Neu: Morni Party!');
    expect((await anon('/api/news/neu-morni-party')).json()).toMatchObject({
      category: 'update',
      // Nie der Anmeldename fürs Panel (security.test.ts): ohne verbundenes Minecraft-Konto „MoinMorni-Team“.
      author: 'MoinMorni-Team',
    });
    const second = (await call('POST', '/api/panel/news', { ...draft, publish: true })).json<{
      slug: string;
    }>();
    expect(second.slug).toBe('neu-morni-party-2');
    expect((await anon('/api/panel/news')).statusCode).toBe(401);
  });

  test('Rangliste und Profile – private Profile bleiben privat', async () => {
    const top = (await anon('/api/stats/top')).json<Array<{ name: string; rank: number }>>();
    expect(top.map((p) => p.name)).toEqual(['Finn', 'Lena']);
    expect((await anon('/api/players/lena')).json()).toMatchObject({
      name: 'Lena',
      playMinutes: 300,
      private: false,
    });
    h.mm.hub.players.setPrivate(FINN, true);
    expect((await anon('/api/players/Finn')).json()).toEqual({ name: 'Finn', private: true });
    expect((await anon('/api/stats/top')).json<Array<{ name: string }>>().map((p) => p.name)).toEqual([
      'Lena',
    ]);
    expect((await anon('/api/players/Niemand')).statusCode).toBe(404);
  });

  test('Bestenlisten der Spielmodi: welche es gibt, Zeiten aufsteigend, private Profile zählen nicht', async () => {
    // Finn ist seit dem Test oben privat.
    h.mm.hub.players.seen({ uuid: MIA, name: 'Mia', bedrock: false });
    h.mm.hub.stats.record({
      mode: 'gipfelsturm',
      uuid: LENA,
      add: { finishes: 3 },
      min: { best_ms: 83_000 },
    });
    h.mm.hub.stats.record({
      mode: 'gipfelsturm',
      uuid: FINN,
      add: { finishes: 5 },
      min: { best_ms: 61_000 },
    });
    h.mm.hub.stats.record({ mode: 'duels', uuid: MIA, add: { wins: 7 } });
    h.mm.hub.stats.record({ mode: 'duels', uuid: FINN, add: { wins: 9 } });
    h.mm.hub.stats.record({ mode: 'gibtsnicht', uuid: MIA, add: { wins: 1 } });
    const boards = (await anon('/api/stats/boards')).json<
      Array<{ mode: string; keys: Array<{ key: string; players: number; order: string }> }>
    >();
    // Reihenfolge wie im Panel (Duels vor Gipfelsturm), unbekannte Modi fallen weg, Finn zählt nicht mit
    expect(boards.map((b) => [b.mode, b.keys.map((k) => `${k.key}:${k.players}:${k.order}`)])).toEqual([
      ['duels', ['wins:1:desc']],
      ['gipfelsturm', ['finishes:1:desc', 'best_ms:1:asc']],
    ]);
    const fastest = (await anon('/api/stats/gipfelsturm/top?key=best_ms&order=asc')).json<
      Array<{ name: string; value: number }>
    >();
    expect(fastest.map((e) => [e.name, e.value])).toEqual([['Lena', 83_000]]);
  });

  test('Team, Regeln und Discord-Einladung', async () => {
    h.mm.hub.players.setRole(LENA, 'moderator');
    const team = (await anon('/api/team')).json<
      Array<{ role: { id: string }; members: Array<{ name: string }> }>
    >();
    expect(team.find((t) => t.role.id === 'moderator')?.members.map((m) => m.name)).toEqual(['Lena']);
    const site = (await anon('/api/site')).json<{
      rules: { de: string[] };
      discordInvite: string | null;
      voiceChannels: string[];
    }>();
    expect(site.rules.de.length).toBe(5);
    expect(site.voiceChannels.length).toBeGreaterThan(0);
    expect(site.discordInvite).toBeNull();
    await call('PUT', '/api/panel/settings/website', { discordInvite: 'https://discord.gg/moinmorni' });
    expect((await anon('/api/site')).json()).toMatchObject({ discordInvite: 'https://discord.gg/moinmorni' });
  });
});
