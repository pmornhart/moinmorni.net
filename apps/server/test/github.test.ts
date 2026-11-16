import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import {
  createGithubClient,
  GithubError,
  GithubLimited,
  parseRefs,
  type GithubClient,
} from '../src/lib/github.js';
import { advertisement, createFakeGithub, sha, type FakeGithub } from './fake-github.js';

const REPO = 'pmornhart/moinmorni.net';
const MAIN = sha('main');
const TOKEN = 'ghp_TestSchluesselNurLesen0123456789';
const NOW = Date.parse('2026-11-16T20:00:00Z');
const SECOND_MS = 1000;
const RESET_IN_SECONDS = 1800;
const RETRY_AFTER_SECONDS = 120;
const FULL_HOUR = 60;
const HTTP_FORBIDDEN = 403;
const bodySchema = z.object({ n: z.number() });
const FIRST = { n: 1 };
const CHANGED_VALUE = 2;
const OTHER_VALUE = 3;
const SECOND = { n: CHANGED_VALUE };
const OTHER = { n: OTHER_VALUE };
// Ein ETag von GitHub: in Anführungszeichen, 64 Hex-Zeichen – "\"ab…12\"" passt, "W/ab" nicht.
// https://regex101.com/?flavor=javascript&regex=%5E%22%5B0-9a-f%5D%7B64%7D%22%24&testString=%22aa4f5bcaa89519fcc8973343d465847025e031858f00c8060d8f316ecb992373%22
const ETAG = /^"[0-9a-f]{64}"$/;

describe('GitHub sparsam', () => {
  let dir: string;
  let gh: FakeGithub;
  const clock = { now: NOW };
  const client = (token: string | null = null): GithubClient =>
    createGithubClient({
      api: 'https://api.github.com',
      web: 'https://github.com',
      token,
      dir,
      fetchImpl: gh.fetch,
      now: () => clock.now,
    });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-github-'));
    gh = createFakeGithub();
    gh.reset = NOW / SECOND_MS + RESET_IN_SECONDS;
    gh.refs.set(
      REPO,
      new Map([
        ['refs/heads/main', MAIN],
        ['refs/tags/v0.1.0', sha('v0.1.0')],
      ]),
    );
    gh.api.set(`${REPO}/things`, FIRST);
    clock.now = NOW;
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('Refs aus Smart HTTP lesen – jede Zeile an ihrer Länge geprüft', () => {
    const text = advertisement(
      new Map([
        ['HEAD', MAIN],
        ['refs/heads/main', MAIN],
      ]),
    );
    expect(parseRefs(text)).toEqual(
      new Map([
        ['HEAD', MAIN],
        ['refs/heads/main', MAIN],
      ]),
    );
    // Eine Länge stimmt nicht (ein Zeichen zu viel in der Zeile) → lieber Fehler als falscher Commit.
    expect(() => parseRefs(text.replace('refs/heads/main', 'refs/heads/mainX'))).toThrow(GithubError);
    expect(parseRefs('001e# service=git-upload-pack\n0000')).toEqual(new Map());
  });

  test('Git sagt den neuesten Commit – ohne API-Frage, nie mit Schlüssel', async () => {
    const refs = await client(TOKEN).refs(REPO);
    expect(refs.get('refs/heads/main')).toBe(MAIN);
    expect(gh.apiCalls).toHaveLength(0);
    expect(gh.gitAuth).toEqual([null]);
    await expect(client().refs('../geheim')).rejects.toThrow('repo_invalid');
    gh.offline = true;
    await expect(client().refs(REPO)).rejects.toMatchObject({ name: 'GithubError', message: 'offline' });
  });

  test('ETag: gleiche Frage nochmal → If-None-Match, 304, gemerkte Antwort (mit Schlüssel zählt sie nicht)', async () => {
    const github = client(TOKEN);
    expect(await github.api(`/repos/${REPO}/things`, bodySchema)).toEqual(FIRST);
    const left = gh.remaining;
    expect(await github.api(`/repos/${REPO}/things`, bodySchema)).toEqual(FIRST);
    expect(gh.apiCalls.at(-1)?.ifNoneMatch).toMatch(ETAG);
    expect(gh.remaining).toBe(left);
    // Neuer Inhalt → neue Antwort.
    gh.api.set(`${REPO}/things`, SECOND);
    expect(await github.api(`/repos/${REPO}/things`, bodySchema)).toEqual(SECOND);
    // Auch nach einem Neustart (neuer Client, gleiche Platte): bedingt gefragt, 304, Antwort von der Platte.
    expect(await client(TOKEN).api(`/repos/${REPO}/things`, bodySchema)).toEqual(SECOND);
    expect(gh.apiCalls.at(-1)?.ifNoneMatch).toMatch(ETAG);
  });

  test('Feste Antworten (settled) werden nie zweimal gefragt – auch nach einem Neustart nicht', async () => {
    await client().api(`/repos/${REPO}/things`, bodySchema, { settled: true });
    await client().api(`/repos/${REPO}/things`, bodySchema, { settled: true });
    expect(gh.apiCalls).toHaveLength(1);
    expect(await client().api(`/repos/${REPO}/fehlt`, bodySchema)).toBeNull();
  });

  test('GitHub bremst (403, 0 übrig): bis zum Zurücksetzen keine Frage mehr – auch nach einem Neustart', async () => {
    gh.remaining = 0;
    const github = client();
    const err = await github.api(`/repos/${REPO}/things`, bodySchema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GithubLimited);
    expect((err as GithubLimited).until).toBe(gh.reset * SECOND_MS);
    expect(github.limitedUntil()).toBe(gh.reset * SECOND_MS);
    const asked = gh.apiCalls.length;
    await expect(github.api(`/repos/${REPO}/things`, bodySchema)).rejects.toBeInstanceOf(GithubLimited);
    await expect(client().api(`/repos/${REPO}/things`, bodySchema)).rejects.toBeInstanceOf(GithubLimited);
    expect(gh.apiCalls).toHaveLength(asked);
    // Git geht trotzdem.
    expect((await github.refs(REPO)).get('refs/heads/main')).toBe(MAIN);
    // Nach dem Zurücksetzen fragt MoinMorni wieder.
    clock.now = gh.reset * SECOND_MS + SECOND_MS;
    gh.remaining = FULL_HOUR;
    expect(await client().api(`/repos/${REPO}/things`, bodySchema)).toEqual(FIRST);
  });

  test('Letzte Frage der Stunde (200, 0 übrig): die nächste wartet; 429 mit Retry-After; anderes 403 ist keine Bremse', async () => {
    gh.remaining = 1;
    const github = client();
    expect(await github.api(`/repos/${REPO}/things`, bodySchema)).toEqual(FIRST);
    expect(github.limitedUntil()).toBe(gh.reset * SECOND_MS);

    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-github-'));
    const fresh = createGithubClient({
      api: 'https://api.github.com',
      web: 'https://github.com',
      token: null,
      dir: other,
      fetchImpl: gh.fetch,
      now: () => clock.now,
    });
    gh.remaining = FULL_HOUR;
    gh.retryAfter = RETRY_AFTER_SECONDS;
    await expect(fresh.api(`/repos/${REPO}/things`, bodySchema)).rejects.toBeInstanceOf(GithubLimited);
    expect(fresh.limitedUntil()).toBe(NOW + RETRY_AFTER_SECONDS * SECOND_MS);
    fs.rmSync(other, { recursive: true, force: true });

    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-github-'));
    const forbidden = createGithubClient({
      api: 'https://api.github.com',
      web: 'https://github.com',
      token: null,
      dir: plain,
      fetchImpl: async () =>
        Response.json({ message: 'Resource not accessible' }, { status: HTTP_FORBIDDEN }),
      now: () => clock.now,
    });
    await expect(forbidden.api(`/repos/${REPO}/things`, bodySchema)).rejects.toMatchObject({
      status: HTTP_FORBIDDEN,
    });
    expect(forbidden.limitedUntil()).toBeNull();
    fs.rmSync(plain, { recursive: true, force: true });
  });

  test('Schlüssel: nur an die API; abgelehnt → ohne weiter; nie in Fehlern oder auf der Platte', async () => {
    const github = client(TOKEN);
    expect(github.key()).toBe('set');
    await github.api(`/repos/${REPO}/things`, bodySchema);
    expect(gh.apiCalls[0]?.auth).toBe(`Bearer ${TOKEN}`);

    gh.badToken = TOKEN;
    gh.api.set(`${REPO}/other`, OTHER);
    expect(await github.api(`/repos/${REPO}/other`, bodySchema)).toEqual(OTHER);
    expect(github.key()).toBe('rejected');
    expect(gh.apiCalls.at(-1)?.auth).toBeNull();

    // Ein Schlüssel mit Zeichen, die im Kopf ungültig wären, geht nie raus (der Fehler nennte sonst den Wert).
    const broken = client('ghp_mit leerzeichen');
    expect(broken.key()).toBe('rejected');
    await broken.api(`/repos/${REPO}/things`, bodySchema);
    expect(gh.apiCalls.at(-1)?.auth).toBeNull();

    gh.offline = true;
    const err = await client(TOKEN)
      .api(`/repos/${REPO}/neu`, bodySchema)
      .catch((e: unknown) => e);
    expect(JSON.stringify(err) + String(err)).not.toContain(TOKEN);
    expect(fs.readFileSync(path.join(dir, 'cache.json'), 'utf8')).not.toContain(TOKEN);
  });
});
