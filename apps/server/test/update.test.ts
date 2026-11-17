import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { createGithubClient } from '../src/lib/github.js';
import { createEventBus } from '../src/lib/events.js';
import type { MotorClient } from '../src/motor/client.js';
import { createStores, type Stores } from '../src/panel/stores.js';
import { changeOf, commitOf, createUpdateService } from '../src/system/update.js';
import { apiCommit, createFakeGithub, sha, type FakeGithub } from './fake-github.js';

const SECRET = 'test-geheimnis-test-geheimnis-test-geheimnis-1234';
const REPO = 'pmornhart/moinmorni.net';
const MOTOR_REPO = 'pmornhart/MorniHosting';
const OLD = 'abc1234';
/** Der Rest eines vollen Commits (40 Zeichen) hinter den ersten sieben. */
const SHA_REST = 33;
const OLD_FULL = `${OLD}${'0'.repeat(SHA_REST)}`;
const NEW_SHA = sha('neue Fassung');
const MOTOR_OLD = '1046a49';
const MOTOR_OLD_FULL = `${MOTOR_OLD}${'1'.repeat(SHA_REST)}`;
const MOTOR_NEW = sha('MorniHosting main');
const TOKEN = 'ghp_TestSchluesselNurLesen0123456789';
const NOW = Date.parse('2026-11-16T20:00:00Z');
const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
const AUTO_TICK_MINUTES = 5;
const AUTO_TICK_MS = AUTO_TICK_MINUTES * MINUTE_MS;
const LATER_MINUTES = 10;
const AUTO_HOUR = 4;
const PLAYERS_ONLINE = 2;
/** Eine Frage für die Liste von MoinMorni, eine für die Zahl beim Motor. */
const FIRST_CHECK_CALLS = 2;
const RESET_IN_SECONDS = 1800;
const FULL_HOUR = 60;
const BEHIND = 2;
const MOTOR_BEHIND = 16;
const SHORT_SHA = 7;

describe('Updates', () => {
  let dir: string;
  let stores: Stores;
  let gh: FakeGithub;
  let motorCalls: string[];
  const clock = { now: NOW };
  const motor = {
    request: async (_method: string, url: string) => {
      motorCalls.push(url);
      if (url === '/api/system/status') return { version: `v0.9.4-0-g${MOTOR_OLD}` };
      throw new Error(`Motor kennt ${url} nicht`);
    },
  } as unknown as MotorClient;

  const service = (version = `v0.0.5-0-g${OLD}`, token: string | null = null) => {
    const config = loadConfig(
      { MM_SECRET: SECRET, MM_MOTOR_TOKEN: 'x', MM_DATA_DIR: dir, MM_VERSION: version },
      dir,
    );
    const github = createGithubClient({
      api: config.githubApi,
      web: config.githubWeb,
      token,
      dir: path.join(dir, 'github'),
      fetchImpl: gh.fetch,
      now: () => clock.now,
    });
    return createUpdateService(config, motor, stores, github, () => clock.now);
  };
  /** MoinMorni auf main hat zwei neue Commits (einer davon ein Merge), MorniHosting 16. */
  const newVersions = (): void => {
    gh.refs.set(REPO, new Map([['refs/heads/main', NEW_SHA]]));
    gh.refs.set(MOTOR_REPO, new Map([['refs/heads/main', MOTOR_NEW]]));
    gh.api.set(`${REPO}/compare/${OLD}...${NEW_SHA}`, {
      ahead_by: BEHIND,
      commits: [
        apiCommit('aaaaaaa1', 'Merge pull request #1'),
        apiCommit(
          NEW_SHA,
          'Gefängnis\n\n- Neu: Zelle in der Lobby\n- Behoben: Figuren doppelt\n\nVerfasst mit Claude 🤖',
          '2026-11-14T22:00:00Z',
        ),
      ],
    });
    gh.api.set(`${MOTOR_REPO}/compare/${MOTOR_OLD}...${MOTOR_NEW}?per_page=1&page=2`, {
      ahead_by: MOTOR_BEHIND,
      commits: [],
    });
  };
  const apiCount = (): number => gh.apiCalls.length;
  const agent = (): void => {
    fs.mkdirSync(path.join(dir, 'update'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'update/agent.json'), '{}');
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-update-'));
    stores = createStores(openDatabase(':memory:').db, createEventBus());
    gh = createFakeGithub();
    gh.reset = NOW / SECOND_MS + RESET_IN_SECONDS;
    gh.refs.set(REPO, new Map([['refs/heads/main', OLD_FULL]]));
    gh.refs.set(MOTOR_REPO, new Map([['refs/heads/main', MOTOR_OLD_FULL]]));
    motorCalls = [];
    clock.now = NOW;
  });
  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('Version und Stichpunkte lesen', () => {
    expect(commitOf('v0.1.2-0-gabc1234')).toBe('abc1234');
    expect(commitOf('dev')).toBeNull();
    expect(changeOf('1234567890', 'Titel\n\n- Neu: A\n- Entfernt: B', null)).toEqual({
      sha: '1234567',
      title: 'Titel',
      date: null,
      items: [
        { kind: 'new', text: 'A' },
        { kind: 'removed', text: 'B' },
      ],
    });
  });

  test('Nichts Neues: Git sagt es – keine einzige API-Frage, auch der Motor fragt GitHub nicht', async () => {
    const view = await service().view();
    expect(view).toMatchObject({
      available: false,
      checkFailed: false,
      changesPending: false,
      limitedUntil: null,
      branchMissing: false,
      githubKey: 'none',
      moinmorni: { current: OLD, latest: OLD, behind: 0, changes: [] },
      motor: { current: `v0.9.4-0-g${MOTOR_OLD}`, latest: MOTOR_OLD, behind: 0 },
    });
    expect(apiCount()).toBe(0);
    // Je einmal Git für MoinMorni und für MorniHosting.
    expect(gh.calls.filter((u) => u.includes('.git/info/refs'))).toEqual([
      `https://github.com/${REPO}.git/info/refs?service=git-upload-pack`,
      `https://github.com/${MOTOR_REPO}.git/info/refs?service=git-upload-pack`,
    ]);
    expect(motorCalls).toEqual(['/api/system/status']);
  });

  test('Neuer Commit: Liste einmal über die API (fester Vergleich), danach nie wieder – auch nach einem Neustart nicht', async () => {
    newVersions();
    const updates = service();
    const view = await updates.view();
    expect(gh.apiCalls.map((c) => c.url)).toEqual([
      `https://api.github.com/repos/${REPO}/compare/${OLD}...${NEW_SHA}`,
      `https://api.github.com/repos/${MOTOR_REPO}/compare/${MOTOR_OLD}...${MOTOR_NEW}?per_page=1&page=2`,
    ]);
    expect(view).toMatchObject({
      available: true,
      changesPending: false,
      canUpdate: false,
      updating: false,
      moinmorni: { current: OLD, latest: NEW_SHA.slice(0, SHORT_SHA), behind: BEHIND },
      motor: {
        current: `v0.9.4-0-g${MOTOR_OLD}`,
        latest: MOTOR_NEW.slice(0, SHORT_SHA),
        behind: MOTOR_BEHIND,
      },
    });
    expect(view.moinmorni.changes).toHaveLength(1);
    expect(view.moinmorni.changes[0]?.items.map((i) => i.kind)).toEqual(['new', 'fixed']);
    await updates.view();
    await updates.check();
    // MoinMorni startet neu (gleiche Platte): Git fragt es wieder, die API nicht.
    const again = await service().view();
    expect(again.moinmorni.changes).toHaveLength(1);
    expect(apiCount()).toBe(FIRST_CHECK_CALLS);
  });

  test('GitHub bremst: freundlicher Hinweis mit Uhrzeit, Update starten geht trotzdem, die Liste kommt danach', async () => {
    newVersions();
    gh.remaining = 0;
    agent();
    const updates = service();
    const view = await updates.view();
    expect(view).toMatchObject({
      available: true,
      checkFailed: false,
      changesPending: true,
      limitedUntil: new Date(gh.reset * SECOND_MS).toISOString(),
      canUpdate: true,
      moinmorni: { latest: NEW_SHA.slice(0, SHORT_SHA), behind: null, changes: [] },
    });
    // Update geht trotzdem: Git sagt, es gibt etwas Neues.
    expect(updates.start('philip').updating).toBe(true);
    expect(fs.existsSync(path.join(dir, 'update/request.json'))).toBe(true);
    // Bis zum Zurücksetzen keine weitere API-Frage – auch nicht über den Knopf.
    const asked = apiCount();
    await updates.check();
    clock.now += LATER_MINUTES * MINUTE_MS;
    await updates.view();
    expect(apiCount()).toBe(asked);
    // Nach dem Zurücksetzen kommt die Liste von selbst.
    clock.now = gh.reset * SECOND_MS + SECOND_MS;
    gh.remaining = FULL_HOUR;
    const later = await updates.view();
    expect(later).toMatchObject({ changesPending: false, limitedUntil: null, moinmorni: { behind: BEHIND } });
    expect(later.moinmorni.changes).toHaveLength(1);
  });

  test('Keine Verbindung zu GitHub: die alte Meldung „nicht erreichbar“', async () => {
    gh.offline = true;
    const view = await service().view();
    expect(view).toMatchObject({
      checkFailed: true,
      available: false,
      changesPending: false,
      limitedUntil: null,
      checkedAt: null,
    });
  });

  test('Den Kanal gibt es auf GitHub (noch) nicht: eigener Hinweis statt „nicht erreichbar“', async () => {
    gh.refs.set(REPO, new Map([['refs/heads/claude/etwas', NEW_SHA]]));
    const view = await service().view();
    expect(view).toMatchObject({ branchMissing: true, checkFailed: false, available: false });
  });

  test('GitHub-Schlüssel: nur der Zustand steht in der Antwort, nie der Schlüssel', async () => {
    newVersions();
    const view = await service(`v0.0.5-0-g${OLD}`, TOKEN).view();
    expect(view.githubKey).toBe('set');
    expect(JSON.stringify(view)).not.toContain(TOKEN);
    expect(gh.apiCalls[0]?.auth).toBe(`Bearer ${TOKEN}`);
  });

  test('Auftrag für den Updater, Fortschritt, Ergebnis einmal für Discord', async () => {
    const updates = service();
    agent();
    const started = updates.start('philip');
    expect(started.updating).toBe(true);
    const request = JSON.parse(fs.readFileSync(path.join(dir, 'update/request.json'), 'utf8')) as object;
    expect(request).toMatchObject({ by: 'philip', motor: 'pinned' });

    // Der Updater nimmt den Auftrag, läuft, ist fertig.
    fs.rmSync(path.join(dir, 'update/request.json'));
    fs.writeFileSync(
      path.join(dir, 'update/status.json'),
      '{"state":"done","step":null,"at":"2026-11-14T23:00:00+01:00","from":"v0.0.5","to":"v0.0.7"}',
    );
    fs.writeFileSync(path.join(dir, 'update/log.txt'), '\u001b[32m✔\u001b[0m Update fertig\n');
    const done = await updates.view();
    expect(done.run).toMatchObject({ state: 'done', from: 'v0.0.5', to: 'v0.0.7', log: ['✔ Update fertig'] });
    expect(updates.takeResult()?.state).toBe('done');
    expect(updates.takeResult()).toBeNull();
  });

  test('Motor auf main nur mit Schalter; automatisch zur eingestellten Stunde, nur wenn niemand spielt – auch während GitHub bremst', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    clock.now = Date.parse('2026-11-15T03:10:00Z'); // 04:10 in Berlin
    gh.reset = clock.now / SECOND_MS + RESET_IN_SECONDS;
    // MoinMorni selbst ist aktuell, nur MorniHosting hat Neues – und GitHub bremst gerade.
    gh.refs.set(MOTOR_REPO, new Map([['refs/heads/main', MOTOR_NEW]]));
    gh.remaining = 0;
    const updates = service();
    agent();
    expect((await updates.view()).available).toBe(false);
    stores.patchSettings('updates', { motorFollowMain: true, hour: AUTO_HOUR }, 'test');
    expect((await updates.view()).motor.behind).toBeNull();
    expect((await updates.view()).available).toBe(true);
    const requested: string[] = [];
    const players = { online: PLAYERS_ONLINE };
    const stop = updates.startAuto(
      () => players.online,
      (by) => requested.push(by),
    );
    await vi.advanceTimersByTimeAsync(AUTO_TICK_MS);
    expect(requested).toEqual([]);
    players.online = 0;
    await vi.advanceTimersByTimeAsync(AUTO_TICK_MS);
    expect(requested).toEqual(['automatisch']);
    const request = JSON.parse(fs.readFileSync(path.join(dir, 'update/request.json'), 'utf8')) as object;
    expect(request).toMatchObject({ motor: 'main' });
    stop();
  });
});
