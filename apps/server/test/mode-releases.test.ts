import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createGithubClient } from '../src/lib/github.js';
import { githubReleases, newestVersionTag, type ReleaseSource } from '../src/network/mode-releases.js';
import { createFakeGithub, sha, type FakeGithub } from './fake-github.js';

const REPO = 'pmornhart/Morni-Bollwek';
/** Repo „Morni-Bollwek“, die Jar heißt richtig „Morni-Bollwerk.jar“. */
const JAR = 'Morni-Bollwerk.jar';
const NOW = Date.parse('2026-11-16T20:00:00Z');
const MINUTE_MS = 60_000;
const CHECK_MINUTES = 10;
const HOUR_MINUTES = 60;
const quiet = { warn: () => undefined, info: () => undefined } as unknown as FastifyBaseLogger;

describe('Releases der Spielmodi ohne API', () => {
  let dir: string;
  let gh: FakeGithub;
  const clock = { now: NOW };
  const source = (): ReleaseSource =>
    githubReleases(
      quiet,
      createGithubClient({
        api: 'https://api.github.com',
        web: 'https://github.com',
        token: null,
        dir: path.join(dir, 'github'),
        fetchImpl: gh.fetch,
        now: () => clock.now,
      }),
      { stateFile: path.join(dir, 'github', 'releases.json'), fetchImpl: gh.fetch, now: () => clock.now },
    );
  const tags = (...names: string[]): void => {
    gh.refs.set(
      REPO,
      new Map([
        ['refs/heads/main', sha('main')],
        ...names.map((n): [string, string] => [`refs/tags/${n}`, sha(n)]),
      ]),
    );
  };
  const downloads = (): string[] => gh.calls.filter((u) => u.includes('/releases/download/'));

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-releases-'));
    gh = createFakeGithub();
    clock.now = NOW;
    tags('v0.1.0', 'v0.1.3', 'v0.1.2');
    gh.assets.set(`${REPO}/v0.1.3/${JAR}`, Buffer.from('jar 0.1.3'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('Höchster Versions-Tag nach Zahlen', () => {
    expect(newestVersionTag(['v0.9.0', 'v0.10.0', 'v0.2.1', 'nightly'])).toBe('v0.10.0');
    expect(newestVersionTag(['1.2.0', 'v1.10.0^{}'])).toBe('1.2.0');
    expect(newestVersionTag([])).toBeNull();
  });

  test('Tags über Git, Jar direkt von der Release-Seite – keine API-Frage; dann 10 Minuten Ruhe', async () => {
    const releases = source();
    const first = await releases.latest(REPO, JAR);
    expect(first).toMatchObject({ repo: REPO, tag: 'v0.1.3', fileName: JAR });
    expect(first?.bytes.toString()).toBe('jar 0.1.3');
    expect(gh.apiCalls).toHaveLength(0);
    expect(downloads()).toEqual([`https://github.com/${REPO}/releases/download/v0.1.3/${JAR}`]);
    // Gleich nochmal: aus dem Speicher, nicht einmal Git.
    const gitBefore = gh.calls.length;
    await releases.latest(REPO, JAR);
    expect(gh.calls).toHaveLength(gitBefore);
    // Nach 10 Minuten: Git fragen; gleicher Tag → nichts herunterladen.
    clock.now += CHECK_MINUTES * MINUTE_MS;
    expect((await releases.latest(REPO, JAR))?.tag).toBe('v0.1.3');
    expect(downloads()).toHaveLength(1);
    // Neuer Tag mit Release → neue Jar.
    tags('v0.1.3', 'v0.2.0');
    gh.assets.set(`${REPO}/v0.2.0/${JAR}`, Buffer.from('jar 0.2.0'));
    clock.now += CHECK_MINUTES * MINUTE_MS;
    expect((await releases.latest(REPO, JAR))?.bytes.toString()).toBe('jar 0.2.0');
    expect(gh.apiCalls).toHaveLength(0);
  });

  test('Neuer Tag, Release noch nicht fertig: der alte Stand bleibt; Jar heißt anders → einmal die API', async () => {
    const releases = source();
    await releases.latest(REPO, JAR);
    tags('v0.1.3', 'v0.2.0');
    clock.now += CHECK_MINUTES * MINUTE_MS;
    // Tag da, Jar noch nicht (Workflow baut noch): die API wird einmal gefragt, findet nichts – alter Stand bleibt.
    expect((await releases.latest(REPO, JAR))?.tag).toBe('v0.1.3');
    expect(gh.apiCalls.map((c) => c.url)).toEqual([
      `https://api.github.com/repos/${REPO}/releases/tags/v0.2.0`,
    ]);
    // Zehn Minuten später: wieder direkt versucht, die API aber nicht nochmal (höchstens einmal pro Stunde).
    clock.now += CHECK_MINUTES * MINUTE_MS;
    await releases.latest(REPO, JAR);
    expect(gh.apiCalls).toHaveLength(1);
    // Die Jar heißt in diesem Release anders: die API kennt den Namen.
    gh.assets.set(`${REPO}/v0.2.0/Bollwerk-neu.jar`, Buffer.from('jar neu'));
    gh.api.set(`${REPO}/releases/tags/v0.2.0`, {
      tag_name: 'v0.2.0',
      assets: [
        {
          name: 'Bollwerk-neu.jar',
          browser_download_url: `https://github.com/${REPO}/releases/download/v0.2.0/Bollwerk-neu.jar`,
        },
      ],
    });
    clock.now += HOUR_MINUTES * MINUTE_MS;
    expect(await releases.latest(REPO, JAR)).toMatchObject({ tag: 'v0.2.0', fileName: 'Bollwerk-neu.jar' });
  });

  test('Nach einem Neustart: gemerktes Release ohne API; ohne Verbindung gilt der letzte Stand', async () => {
    await source().latest(REPO, JAR);
    const restarted = source();
    expect((await restarted.latest(REPO, JAR))?.tag).toBe('v0.1.3');
    expect(gh.apiCalls).toHaveLength(0);
    // GitHub ganz weg: ein neuer Neustart nimmt, was er zuletzt kannte, und lädt es, sobald es geht.
    gh.offline = true;
    const offline = source();
    expect(await offline.latest(REPO, JAR)).toBeNull();
    gh.offline = false;
    clock.now += CHECK_MINUTES * MINUTE_MS;
    expect((await offline.latest(REPO, JAR))?.tag).toBe('v0.1.3');
  });

  test('Ohne Versions-Tags (noch kein Release): nichts, und die API höchstens einmal pro Stunde', async () => {
    gh.refs.set(REPO, new Map([['refs/heads/main', sha('main')]]));
    const releases = source();
    expect(await releases.latest(REPO, JAR)).toBeNull();
    clock.now += CHECK_MINUTES * MINUTE_MS;
    expect(await releases.latest(REPO, JAR)).toBeNull();
    expect(gh.apiCalls.map((c) => c.url)).toEqual([`https://api.github.com/repos/${REPO}/releases/latest`]);
  });
});
