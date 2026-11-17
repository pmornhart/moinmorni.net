import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PublicChangelog } from '@moinmorni/shared';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Api } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { createEventBus } from '../src/lib/events.js';
import { createGithubClient } from '../src/lib/github.js';
import type { MotorClient } from '../src/motor/client.js';
import { createStores, type Stores } from '../src/panel/stores.js';
import { bulletItems, itemsOf, subjectItem } from '../src/system/changes.js';
import {
  changelogFor,
  installedVersion,
  parseChangelog,
  registerChangelogRoute,
} from '../src/system/changelog.js';
import { changeOf, createUpdateService, firstParentSteps } from '../src/system/update.js';
import { apiCommit, createFakeGithub, sha, type FakeGithub } from './fake-github.js';

const SCRIPT = path.resolve(import.meta.dirname, '../../../scripts/changelog.sh');
const SECRET = 'test-geheimnis-test-geheimnis-test-geheimnis-1234';
const REPO = 'pmornhart/moinmorni.net';
const SIGNATURE = [
  '',
  'Verfasst mit Claude 🤖',
  '',
  'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
  'Claude-Session: https://claude.ai/code/session_test',
].join('\n');
const HTTP_OK = 200;
const MINUTE_MS = 60_000;
const AUTO_TICK_MINUTES = 5;
const AUTO_TICK_MS = AUTO_TICK_MINUTES * MINUTE_MS;
const SHORT_SHA = 7;
/** Updates zwischen dem laufenden Stand und dem neuesten im nachgebauten GitHub (erste Elternlinie). */
const STEPS = 3;
/** Commits im Vergleich (mit dem Zweig, den der Merge hereinholt) – mehr als Updates. */
const AHEAD = 4;
/** Versionen im Test-Repo mit zwei Zweigen. */
const VERSIONS = 5;
/** So viele Versionen, wenn nur die letzten gewünscht sind. */
const NEWEST_TWO = 2;
/** Stichpunkte in einem großen Commit, davon zeigt die Liste 30 (der Rest als Zahl). */
const MANY = 35;
const SHOWN = 30;
/** Version 188 = v1.8.8 (wie mm_version). */
const BIG_COUNT = 188;
/** Rest eines vollen Commits hinter den ersten sieben Zeichen. */
const SHA_REST = 33;
const PAD = 2;

/** Git im Test-Repo, mit festen Namen und Zeiten (jeder Commit eine Minute später). */
function gitIn(dir: string) {
  const clock = { minute: 0 };
  const run = (...args: string[]): string =>
    execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 't@t',
        GIT_AUTHOR_DATE: `2026-11-16T10:${String(clock.minute).padStart(PAD, '0')}:00+01:00`,
        GIT_COMMITTER_DATE: `2026-11-16T10:${String(clock.minute).padStart(PAD, '0')}:00+01:00`,
      },
    });
  const commit = (message: string): void => {
    clock.minute += 1;
    fs.appendFileSync(path.join(dir, 'datei.txt'), `${message.length}\n`);
    run('add', '.');
    run('commit', '-q', '-m', message);
  };
  const merge = (branch: string, message: string): void => {
    clock.minute += 1;
    run('merge', '-q', '--no-ff', branch, '-m', message);
  };
  return { run, commit, merge };
}

describe('Was ist neu: Commit-Nachrichten lesen', () => {
  test('Stichpunkte mit Art, umgebrochene Zeilen, Unterschrift und Prüf-Notizen weg', () => {
    const items = bulletItems(
      [
        'Gefängnis',
        '',
        '- Neu: Zelle im Rathauskeller mit `/gefaengnis`',
        '- Behoben: Figuren standen doppelt, wenn die Lobby',
        '  mitten im Bau neu startete',
        '- Verbessert: Leiste zeigt die Restzeit',
        '- Entfernt: alte Parkour-Spirale',
        '- Lobby lädt jetzt schneller',
        '- Echt geprüft: 42/42 mit Test-Spielern',
        '# Conflicts:',
        '#\tSTAND.md',
        SIGNATURE,
      ].join('\n'),
    );
    expect(items).toEqual([
      { kind: 'new', text: 'Zelle im Rathauskeller mit /gefaengnis' },
      { kind: 'fixed', text: 'Figuren standen doppelt, wenn die Lobby mitten im Bau neu startete' },
      { kind: 'improved', text: 'Leiste zeigt die Restzeit' },
      { kind: 'removed', text: 'alte Parkour-Spirale' },
      { kind: 'improved', text: 'Lobby lädt jetzt schneller' },
    ]);
  });

  test('Ohne Stichpunkte zählt der Betreff, nach Wörtern eingeordnet – Merge und Doku nicht', () => {
    expect(itemsOf(`Wartungs-Lobby: Funde aus dem echten Test behoben${SIGNATURE}`)).toEqual([
      { kind: 'fixed', text: 'Wartungs-Lobby: Funde aus dem echten Test behoben' },
    ]);
    expect(subjectItem('Neue Spielmodi im Netzwerk')?.kind).toBe('new');
    expect(subjectItem('Menüpunkt „API“ entfernt')?.kind).toBe('removed');
    expect(subjectItem('Proxmox-Einzeiler bequemer')?.kind).toBe('improved');
    expect(subjectItem('Webseite: echte Minecraft-Bilder statt eigener Renderings')?.kind).toBe('other');
    expect(subjectItem("Merge branch 'trailer' into main")).toBeNull();
    expect(itemsOf('STAND: Wartungs-Lobby – Bilder ergänzt\n\n- Neu: Bilder')).toEqual([]);
    expect(itemsOf('Fortschrittsseite: alle Modi veröffentlicht')).toEqual([]);
    // Die Update-Karte im Panel liest genauso.
    expect(changeOf('1234567890', 'Start ist schneller', null).items).toEqual([
      { kind: 'improved', text: 'Start ist schneller' },
    ]);
  });
});

describe('Was ist neu: Liste aus Git (scripts/changelog.sh)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-changelog-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const list = (max?: number): string =>
    execFileSync('bash', [SCRIPT, dir, ...(max === undefined ? [] : [String(max)])], { encoding: 'utf8' });

  test('je Commit auf dem Branch eine Version, Nummer wie mm_version, Merges mit dem, was sie hereinholen', () => {
    const git = gitIn(dir);
    git.run('init', '-q', '-b', 'main');
    git.commit('Lobby baut sich selbst');
    git.commit(
      `Gefängnis\n\n- Neu: Zelle im Rathauskeller\n- Behoben: Figuren doppelt\n- Echt geprüft: 12/12${SIGNATURE}`,
    );
    git.commit(`STAND: Gefängnis eingetragen${SIGNATURE}`);
    // Ein Zweig ohne eigene Worte im Merge: dann zählen die Stichpunkte der hereingeholten Commits.
    git.run('checkout', '-q', '-b', 'musik');
    git.commit(`Lobbymusik\n\n- Neu: Blasmusik in der Lobby 🎺${SIGNATURE}`);
    git.commit('Fehler beim Start der Kapelle behoben');
    git.commit('Neue Lieder für den Winter\n\n- Neu: Blasmusik in der Lobby 🎺');
    git.run('checkout', '-q', 'main');
    git.merge('musik', "Merge branch 'musik'\n\n# Conflicts:\n#\tSTAND.md");
    // Ein Merge mit eigenen Stichpunkten: die zählen, nicht die einzelnen Commits des Zweigs.
    git.run('checkout', '-q', '-b', 'wartung');
    git.commit('- Neu: interne Kleinigkeit');
    git.commit('Wartungs-Lobby: Fund');
    git.run('checkout', '-q', 'main');
    git.merge(
      'wartung',
      `Merge claude/wartung in main: Wartungs-Lobby\n\n- Neu: Wartungs-Lobby auf der Alm${SIGNATURE}`,
    );

    const total = Number(git.run('rev-list', '--count', '--first-parent', 'HEAD').trim());
    const head = git.run('rev-parse', '--short', 'HEAD').trim();
    const versions = parseChangelog(list());
    expect(total).toBe(VERSIONS);
    expect(versions.map((v) => v.version)).toEqual(['v0.0.5', 'v0.0.4', 'v0.0.3', 'v0.0.2', 'v0.0.1']);
    expect(versions[0]).toMatchObject({
      count: VERSIONS,
      sha: head,
      items: [{ kind: 'new', text: 'Wartungs-Lobby auf der Alm' }],
      more: 0,
    });
    expect(versions[0]?.date).toBe(git.run('log', '-1', '--format=%cI').trim());
    // Merge ohne eigene Worte: hereingeholte Stichpunkte, Doppeltes nur einmal, Unterschrift und Konflikte weg.
    expect(versions[1]?.items).toEqual([
      { kind: 'new', text: 'Blasmusik in der Lobby 🎺' },
      { kind: 'fixed', text: 'Fehler beim Start der Kapelle behoben' },
    ]);
    // Reiner Doku-Commit: Version da, Änderungen keine.
    expect(versions[2]?.items).toEqual([]);
    expect(versions[3]?.items).toEqual([
      { kind: 'new', text: 'Zelle im Rathauskeller' },
      { kind: 'fixed', text: 'Figuren doppelt' },
    ]);
    expect(versions[4]?.items).toEqual([{ kind: 'other', text: 'Lobby baut sich selbst' }]);
    // Nur die letzten Versionen, wenn gewünscht.
    expect(parseChangelog(list(NEWEST_TWO)).map((v) => v.count)).toEqual([VERSIONS, VERSIONS - 1]);
    // Nur Commit-Texte: nichts aus Dateien des Repos (z. B. einer .env).
    fs.writeFileSync(path.join(dir, '.env'), 'MM_SECRET=streng-geheim\n');
    expect(list()).not.toContain('streng-geheim');
  });

  test('Nummern über 100 und viele Änderungen je Version (der Rest als Zahl)', () => {
    const git = gitIn(dir);
    git.run('init', '-q', '-b', 'main');
    const many = Array.from({ length: MANY }, (_, i) => `- Neu: Stück ${i + 1}`).join('\n');
    git.commit(`Viel auf einmal\n\n${many}`);
    const text = list().replace('\u001eV 1 ', `\u001eV ${BIG_COUNT} `);
    const [version] = parseChangelog(text);
    expect(version?.version).toBe('v1.8.8');
    expect(version?.items).toHaveLength(SHOWN);
    expect(version?.more).toBe(MANY - SHOWN);
  });

  test('Datei passt nicht zur installierten Version → lieber nichts; fehlt sie → nur die Nummer', () => {
    const git = gitIn(dir);
    git.run('init', '-q', '-b', 'main');
    git.commit('Erster Stand\n\n- Neu: A');
    git.commit('Zweiter Stand\n\n- Neu: B');
    const file = path.join(dir, 'changelog.txt');
    fs.writeFileSync(file, list());
    const head = git.run('rev-parse', '--short', 'HEAD').trim();
    const first = git.run('rev-parse', '--short', 'HEAD~1').trim();
    expect(changelogFor(`v0.0.2-0-g${head}`, file).map((v) => v.count)).toEqual([NEWEST_TWO, 1]);
    // Läuft Version 1: nur bis dahin.
    expect(changelogFor(`v0.0.1-0-g${first}`, file).map((v) => v.count)).toEqual([1]);
    // Andere Version 2 (anderer Commit): nichts Falsches zeigen.
    expect(changelogFor('v0.0.2-0-gabcdef1', file)).toEqual([]);
    expect(changelogFor(`v0.0.2-0-g${head}`, null)).toEqual([]);
    expect(changelogFor('dev', path.join(dir, 'fehlt.txt'))).toEqual([]);
    expect(parseChangelog('irgendwas anderes')).toEqual([]);
    expect(installedVersion(`v0.0.2-0-g${head}`, [])).toBe('v0.0.2');
    expect(installedVersion('dev', changelogFor('dev', file))).toBe('v0.0.2');
    expect(installedVersion('dev', [])).toBe('dev');
  });
});

describe('Was ist neu: öffentliche Schnittstelle und neue Version', () => {
  let dir: string;
  let stores: Stores;
  let gh: FakeGithub;
  const OLD = 'abc1234';
  const OLD_FULL = `${OLD}${'0'.repeat(SHA_REST)}`;
  const A = sha('A');
  const B = sha('B im Zweig');
  const M = sha('Merge');
  const NEW = sha('neu');
  const motor = {
    request: async () => ({ version: 'v0.9.4-0-g1046a49' }),
  } as unknown as MotorClient;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-changelog-api-'));
    stores = createStores(openDatabase(':memory:').db, createEventBus());
    gh = createFakeGithub();
    gh.refs.set(REPO, new Map([['refs/heads/main', NEW]]));
    gh.refs.set('pmornhart/MorniHosting', new Map([['refs/heads/main', `1046a49${'1'.repeat(SHA_REST)}`]]));
    // Wie GitHub: alle Commits seit dem laufenden, auch die eines hereingeholten Zweigs, mit ihren Eltern.
    gh.api.set(`${REPO}/compare/${OLD}...${NEW}`, {
      ahead_by: AHEAD,
      commits: [
        apiCommit(A, 'Lobby\n\n- Neu: A', '2026-11-16T10:00:00Z', [OLD_FULL]),
        apiCommit(B, 'Zweig\n\n- Neu: B', '2026-11-16T10:01:00Z', [OLD_FULL]),
        apiCommit(M, "Merge branch 'zweig'", '2026-11-16T10:02:00Z', [A, B]),
        apiCommit(NEW, 'Fix\n\n- Behoben: C', '2026-11-16T10:03:00Z', [M]),
      ],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const service = () => {
    const config = loadConfig(
      { MM_SECRET: SECRET, MM_MOTOR_TOKEN: 'x', MM_DATA_DIR: dir, MM_VERSION: `v0.0.5-0-g${OLD}` },
      dir,
    );
    const github = createGithubClient({
      api: config.githubApi,
      web: config.githubWeb,
      token: null,
      dir: path.join(dir, 'github'),
      fetchImpl: gh.fetch,
    });
    return createUpdateService(config, motor, stores, github);
  };

  test('Updates bis zur neuesten Fassung nach der ersten Elternlinie (wie die Versionsnummer)', () => {
    const commits = [
      { sha: A, parents: [{ sha: OLD_FULL }] },
      { sha: B, parents: [{ sha: OLD_FULL }] },
      { sha: M, parents: [{ sha: A }, { sha: B }] },
      { sha: NEW, parents: [{ sha: M }] },
    ];
    expect(firstParentSteps(commits, OLD, NEW)).toBe(STEPS);
    // Weg nicht vollständig in der Liste (mehr als GitHub schickt) → unbekannt.
    expect(firstParentSteps(commits.slice(1), OLD, NEW)).toBeNull();
    expect(firstParentSteps([], OLD, NEW)).toBeNull();
  });

  test('GET /api/public/changelog: Version, Liste, „Update bereit“ mit neuer Nummer – ohne GitHub zu fragen', async () => {
    const repo = path.join(dir, 'repo');
    fs.mkdirSync(repo);
    const inRepo = gitIn(repo);
    inRepo.run('init', '-q', '-b', 'main');
    ['Eins', 'Zwei', 'Drei', 'Vier', 'Fünf'].forEach((n) => inRepo.commit(`${n}\n\n- Neu: ${n}`));
    const file = path.join(dir, 'changelog.txt');
    const text = execFileSync('bash', [SCRIPT, repo], { encoding: 'utf8' });
    const head = inRepo.run('rev-parse', '--short', 'HEAD').trim();
    // Die Datei gehört zur laufenden Version: Commit der Version 5 = OLD.
    fs.writeFileSync(file, text.replaceAll(head, OLD));

    const updates = service();
    const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    registerChangelogRoute(app as unknown as Api, {
      version: `v0.0.5-0-g${OLD}`,
      file,
      update: () => updates.peek(),
    });
    const ask = async (): Promise<PublicChangelog> => {
      const res = await app.inject({ method: 'GET', url: '/api/public/changelog' });
      expect(res.statusCode).toBe(HTTP_OK);
      expect(res.headers['cache-control']).toBe('public, max-age=60');
      return res.json<PublicChangelog>();
    };

    // Noch nie nachgesehen: nichts bereit, und die Anfrage fragt GitHub nicht.
    const before = await ask();
    expect(before.version).toBe('v0.0.5');
    expect(before.versions.map((v) => v.version)).toEqual(['v0.0.5', 'v0.0.4', 'v0.0.3', 'v0.0.2', 'v0.0.1']);
    expect(before.versions[0]).toMatchObject({ sha: OLD, items: [{ kind: 'new', text: 'Fünf' }] });
    expect(before.update).toEqual({ available: false, version: null });
    expect(gh.calls).toEqual([]);

    // Von selbst nachsehen (alle fünf Minuten): danach steht v0.0.8 bereit (5 + 3 Updates, nicht + 4 Commits).
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const stop = updates.startAuto(
      () => 0,
      () => undefined,
    );
    await vi.advanceTimersByTimeAsync(AUTO_TICK_MS);
    stop();
    const after = await ask();
    expect(after.update).toEqual({ available: true, version: 'v0.0.8' });
    expect((await updates.view()).moinmorni.latestVersion).toBe('v0.0.8');
    // Nur öffentliche Angaben: keine Interna des Updates (Protokoll, Kanal, Schlüssel …).
    expect(Object.keys(after).sort()).toEqual(['update', 'version', 'versions']);
    expect(Object.keys(after.update).sort()).toEqual(['available', 'version']);

    // Neustart (gleiche Platte): Vergleich samt Zahl kommt von der Platte, keine neue API-Frage.
    const asked = gh.apiCalls.length;
    const again = service();
    const view = await again.view();
    expect(view.moinmorni.latestVersion).toBe('v0.0.8');
    expect(again.peek()).toEqual({ available: true, version: 'v0.0.8' });
    expect(gh.apiCalls.length).toBe(asked);
    expect(view.moinmorni.latest).toBe(NEW.slice(0, SHORT_SHA));
    await app.close();
  });
});
