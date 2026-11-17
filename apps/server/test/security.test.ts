import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { applications, teamMembers } from '../src/db/schema.js';
import { motorPathAllowed } from '../src/motor/proxy.js';
import { TEAM_AUTHOR } from '../src/public/author.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';

/**
 * Sicherheitsprüfung (16.11.): jeder Fund als Test, der ohne die Behebung rot ist.
 */

type Session = { cookie: string; csrf: string };

const LENA = '22222222-2222-2222-2222-222222222222';
const NEVER_PLAYED = '55555555-5555-5555-5555-555555555555';
const THEME_SCRIPT = "document.documentElement.classList.toggle('dark', true);";
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNSUPPORTED = 415;
const HTTP_TOO_MANY = 429;
const SETUP_MS = 60_000;
const LOGIN_LIMIT = 20;
const APPLY_LIMIT = 10;
const SETUP_LIMIT = 5;

/** Anfrage mit dem Pfad genau so, wie er geschrieben ist (fetch und inject räumen „./“ vorher weg). */
function rawRequest(
  base: string,
  method: string,
  rawPath: string,
): Promise<{ status: number; body: string }> {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: url.hostname,
        port: url.port,
        method,
        path: rawPath,
        headers: { 'content-type': 'application/json', origin: base },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
      },
    );
    req.on('error', reject);
    req.end(method === 'GET' ? undefined : '{}');
  });
}

describe('Sicherheit', () => {
  let h: Harness;
  let web: string;
  let owner: Session;
  const call = (method: string, url: string, session?: Session, payload?: object) =>
    h.mm.app.inject({
      method: method as 'GET',
      url,
      ...(payload ? { payload } : {}),
      headers: session ? { cookie: session.cookie, 'x-csrf-token': session.csrf } : {},
    });
  /** Team-Konto anlegen und gleich anmelden (das Startpasswort kommt aus der Antwort). */
  const member = async (username: string, roleId: string): Promise<Session> => {
    const res = await call('POST', '/api/panel/team', owner, { username, roleId });
    expect(res.statusCode, res.body).toBe(HTTP_OK);
    return h.login(username, res.json<{ password: string }>().password);
  };

  beforeAll(async () => {
    web = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-web-'));
    fs.writeFileSync(
      path.join(web, 'index.html'),
      `<!doctype html><html><head><script>${THEME_SCRIPT}</script>` +
        '<script type="module" crossorigin src="/assets/index.js"></script></head><body></body></html>',
    );
    h = await createHarness({ webDir: web });
    owner = await h.login('philip', OWNER_PASSWORD);
    h.mm.hub.players.seen({ uuid: LENA, name: 'Lena', bedrock: false });
  }, SETUP_MS);
  afterAll(async () => {
    await h.cleanup();
    fs.rmSync(web, { recursive: true, force: true });
  });

  test('Browser-Regeln (CSP): Skripte nur von der eigenen Seite plus das Hell/Dunkel-Skript, kein fremder Rahmen', async () => {
    const page = await call('GET', '/');
    expect(page.statusCode).toBe(HTTP_OK);
    const csp = String(page.headers['content-security-policy'] ?? '');
    const hash = crypto.createHash('sha256').update(THEME_SCRIPT, 'utf8').digest('base64');
    const directive = (name: string): string =>
      csp
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith(`${name} `)) ?? '';
    expect(directive('script-src')).toBe(`script-src 'self' 'sha256-${hash}'`);
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'self'");
    expect(directive('base-uri')).toBe("base-uri 'self'");
    expect(directive('connect-src')).toContain("'self'");
    expect(directive('connect-src')).not.toContain('https:');
    // Auch Antworten der API tragen die Regeln (falls je ein Text als Seite geöffnet wird).
    expect((await call('GET', '/api/site')).headers['content-security-policy']).toBe(csp);
  });

  test('News auf der Webseite nennen nie den Anmeldenamen fürs Panel, sondern den Minecraft-Namen oder das Team', async () => {
    const created = await call('POST', '/api/panel/news', owner, {
      category: 'info',
      title: { de: 'Servus', en: '' },
      body: { de: 'Hallo zusammen.', en: '' },
      pinned: false,
      publish: true,
    });
    expect(created.statusCode).toBe(HTTP_OK);
    const slug = created.json<{ slug: string }>().slug;
    const shown = async (): Promise<string[]> => [
      ...(await call('GET', '/api/news')).json<Array<{ author: string }>>().map((n) => n.author),
      (await call('GET', `/api/news/${slug}`)).json<{ author: string }>().author,
    ];
    expect(await shown()).toEqual([TEAM_AUTHOR, TEAM_AUTHOR]);
    // Mit verbundenem Minecraft-Konto: dessen Name (den sieht im Spiel jeder).
    h.mm.db.update(teamMembers).set({ minecraftUuid: LENA }).where(eq(teamMembers.username, 'philip')).run();
    expect(await shown()).toEqual(['Lena', 'Lena']);
    // Das Panel (nur fürs Team) zeigt weiter, wer es war.
    expect((await call('GET', '/api/panel/news', owner)).json<Array<{ author: string }>>()[0]?.author).toBe(
      'philip',
    );
    h.mm.db.update(teamMembers).set({ minecraftUuid: null }).where(eq(teamMembers.username, 'philip')).run();
  });

  test('Team-Seite: wer noch nie im Netzwerk war, steht nicht mit seinem Anmeldenamen da', async () => {
    h.mm.db
      .update(teamMembers)
      .set({ minecraftUuid: NEVER_PLAYED })
      .where(eq(teamMembers.username, 'philip'))
      .run();
    const team = JSON.stringify((await call('GET', '/api/team')).json());
    expect(team).not.toContain('philip');
    expect(team).not.toContain(NEVER_PLAYED);
    h.mm.db.update(teamMembers).set({ minecraftUuid: LENA }).where(eq(teamMembers.username, 'philip')).run();
    const withLena = (await call('GET', '/api/team')).json<
      Array<{ role: { id: string }; members: Array<{ name: string }> }>
    >();
    expect(withLena.find((r) => r.role.id === 'owner')?.members.map((m) => m.name)).toEqual(['Lena']);
    h.mm.db.update(teamMembers).set({ minecraftUuid: null }).where(eq(teamMembers.username, 'philip')).run();
  });

  test('Weiterleitung zum Motor: „.“-Abschnitte und „\\“ kommen nicht durch (vorher Fehler 500 und Eintrag im Protokoll)', async () => {
    expect(motorPathAllowed('/api/auth/./register')).toBe(false);
    expect(motorPathAllowed('/api/servers/./x')).toBe(false);
    expect(motorPathAllowed('/api/servers/.')).toBe(false);
    expect(motorPathAllowed('/api/auth\\register')).toBe(false);
    expect(motorPathAllowed('/api/auth/login')).toBe(true);
    expect(motorPathAllowed('/api/servers/ab12/files/content')).toBe(true);
    const tries = ['/panel/motor/api/auth/./register', '/panel/motor/api/servers/./x'].flatMap((raw) =>
      ['GET', 'POST'].map((method) => ({ raw, method })),
    );
    const answers = await Promise.all(
      tries.map(async ({ raw, method }) => ({ raw, method, ...(await rawRequest(h.mmUrl, method, raw)) })),
    );
    answers.forEach((a) => expect(a.status, `${a.method} ${a.raw}: ${a.body}`).toBe(HTTP_NOT_FOUND));
  });

  test('MorniCraft: Whitelist und Bewerbungen nur, wer kicken darf – der Bereich „Spieler“ allein reicht nicht', async () => {
    const supporter = await member('susi', 'supporter');
    const moderator = await member('mods', 'moderator');
    const app = h.mm.db
      .insert(applications)
      .values({
        mode: 'mornicraft',
        minecraftName: 'Finn',
        answers: { about: 'Ich baue gern Häuser und Burgen.', why: 'Freunde', age: '' },
        via: 'website',
      })
      .returning()
      .get();

    // Der Supporter sieht alles (Bereich „Spieler“), darf aber niemanden an der Bewerbung vorbei hineinlassen.
    expect((await call('GET', '/api/panel/whitelist', supporter)).statusCode).toBe(HTTP_OK);
    const sneak = await call('POST', '/api/panel/whitelist', supporter, { name: 'Freund_von_Susi' });
    expect(sneak.statusCode).toBe(HTTP_FORBIDDEN);
    expect(sneak.json()).toEqual({ error: 'mornicraft_no_right' });
    const list = (await call('GET', '/api/panel/applications/all', supporter)).json<{
      applications: Array<{ id: number; canDecide: boolean }>;
    }>();
    expect(list.applications.find((a) => a.id === app.id)?.canDecide).toBe(false);
    const decide = await call('POST', `/api/panel/applications/${app.id}/decide`, supporter, {
      accept: true,
    });
    expect(decide.statusCode).toBe(HTTP_FORBIDDEN);
    expect(decide.json()).toEqual({ error: 'mornicraft_no_right' });

    // Der Moderator darf (wie mit den Knöpfen in Discord).
    const added = await call('POST', '/api/panel/whitelist', moderator, { name: 'Gast_1' });
    expect(added.statusCode).toBe(HTTP_OK);
    const id = added.json<{ id: number }>().id;
    expect((await call('DELETE', `/api/panel/whitelist/${id}`, supporter)).statusCode).toBe(HTTP_FORBIDDEN);
    expect((await call('DELETE', `/api/panel/whitelist/${id}`, moderator)).statusCode).toBe(HTTP_OK);
    const yes = await call('POST', `/api/panel/applications/${app.id}/decide`, moderator, { accept: true });
    expect(yes.statusCode, yes.body).toBe(HTTP_OK);
    expect(
      (await call('GET', '/api/panel/whitelist', moderator))
        .json<Array<{ name: string }>>()
        .map((w) => w.name),
    ).toContain('finn');
  });

  test('Bewerben auf der Webseite: Grenzen pro Besucher (Anmelden mit Discord, Formulare)', async () => {
    /** Nacheinander (die Grenze zählt mit), nicht gleichzeitig. */
    const statuses = (n: number, run: () => Promise<{ statusCode: number }>): Promise<number[]> =>
      Array.from({ length: n }).reduce<Promise<number[]>>(
        async (before, _) => [...(await before), (await run()).statusCode],
        Promise.resolve([]),
      );
    const login = await statuses(LOGIN_LIMIT + 1, () => call('GET', '/api/public/apply/login'));
    expect(login.slice(0, LOGIN_LIMIT).every((s) => s !== HTTP_TOO_MANY)).toBe(true);
    expect(login.at(-1)).toBe(HTTP_TOO_MANY);
    const form = await statuses(APPLY_LIMIT + 1, () =>
      call('POST', '/api/public/team-apply', undefined, { position: 'moderator', answers: [] }),
    );
    expect(form.slice(0, APPLY_LIMIT)).toEqual(Array.from({ length: APPLY_LIMIT }, () => HTTP_UNAUTHORIZED));
    expect(form.at(-1)).toBe(HTTP_TOO_MANY);
  });

  test('Kaputte Anfragen von außen: 400/415/429 statt Fehler 500 (der füllte sonst das Fehlerprotokoll)', async () => {
    const broken = await h.mm.app.inject({
      method: 'POST',
      url: '/api/public/apply',
      headers: { 'content-type': 'application/json' },
      payload: '{"minecraftName": ',
    });
    expect(broken.statusCode).toBe(HTTP_BAD_REQUEST);
    expect(broken.json()).toEqual({ error: 'invalid_request' });
    const xml = await h.mm.app.inject({
      method: 'POST',
      url: '/api/public/apply',
      headers: { 'content-type': 'application/xml' },
      payload: '<x/>',
    });
    expect(xml.statusCode).toBe(HTTP_UNSUPPORTED);
    expect(xml.json()).toEqual({ error: 'unsupported_media_type' });
    // Die Grenze der Einrichtung (5 pro Minute) sagt „zu oft“ – vorher kam „internal“ mit 500.
    const tries = await Array.from({ length: SETUP_LIMIT + 1 }).reduce<Promise<number[]>>(
      async (before, _) => [
        ...(await before),
        (await call('POST', '/api/setup', undefined, { code: 'x' })).statusCode,
      ],
      Promise.resolve([]),
    );
    expect(tries.at(-1)).toBe(HTTP_TOO_MANY);
  });

  test('Discord-Bilder (bis 15 MB): Unangemeldete werden abgewiesen, bevor der Server den Inhalt liest', async () => {
    const answers = await Promise.all(
      ['icon', 'banner', 'bot'].map(async (part) => ({
        part,
        res: await h.mm.app.inject({
          method: 'PUT',
          url: `/api/panel/discord/appearance/${part}`,
          headers: { 'content-type': 'application/json' },
          payload: '{"image": ',
        }),
      })),
    );
    answers.forEach(({ part, res }) => expect(res.statusCode, part).toBe(HTTP_UNAUTHORIZED));
  });
});
