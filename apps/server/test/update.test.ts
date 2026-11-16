import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { createEventBus } from '../src/lib/events.js';
import type { MotorClient } from '../src/motor/client.js';
import { createStores, type Stores } from '../src/panel/stores.js';
import { changeOf, commitOf, createUpdateService } from '../src/system/update.js';

const SECRET = 'test-geheimnis-test-geheimnis-test-geheimnis-1234';
const OLD = 'abc1234';
const NEW_SHA = 'def5678000000000000000000000000000000000';

describe('Updates', () => {
  let dir: string;
  let stores: Stores;
  let calls: string[];
  const motor = {
    request: async () => ({ current: '1046a49', latest: '2222222', behind: 3 }),
  } as unknown as MotorClient;
  const github = async (url: string): Promise<Response> => {
    calls.push(url);
    const body = url.includes('/compare/')
      ? {
          ahead_by: 2,
          commits: [
            { sha: 'aaaaaaa1', commit: { message: 'Merge pull request #1', committer: null } },
            {
              sha: NEW_SHA,
              commit: {
                message:
                  'Gefängnis\n\n- Neu: Zelle in der Lobby\n- Behoben: Figuren doppelt\n\nVerfasst mit Claude 🤖',
                committer: { date: '2026-11-14T22:00:00Z' },
              },
            },
          ],
        }
      : { sha: NEW_SHA, commit: { message: 'x', committer: null } };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const service = (version: string, now = () => Date.now()) =>
    createUpdateService(
      loadConfig({ MM_SECRET: SECRET, MM_MOTOR_TOKEN: 'x', MM_DATA_DIR: dir, MM_VERSION: version }, dir),
      motor,
      stores,
      github,
      now,
    );

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-update-'));
    stores = createStores(openDatabase(':memory:').db, createEventBus());
    calls = [];
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

  test('fragt GitHub, zeigt Änderungen ohne Merge, merkt sich die Antwort', async () => {
    const updates = service(`v0.0.5-0-g${OLD}`);
    const view = await updates.view();
    expect(calls[0]).toContain(`/repos/pmornhart/morni.net/compare/${OLD}...main`);
    expect(view).toMatchObject({
      available: true,
      canUpdate: false,
      updating: false,
      morninet: { current: OLD, latest: 'def5678', behind: 2 },
      motor: { current: '1046a49', behind: 3 },
    });
    expect(view.morninet.changes).toHaveLength(1);
    expect(view.morninet.changes[0]?.items.map((i) => i.kind)).toEqual(['new', 'fixed']);
    await updates.view();
    expect(calls).toHaveLength(1);
  });

  test('Auftrag für den Updater, Fortschritt, Ergebnis einmal für Discord', async () => {
    const updates = service(`v0.0.5-0-g${OLD}`);
    fs.mkdirSync(path.join(dir, 'update'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'update/agent.json'), '{}');
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

  test('Motor auf main nur mit Schalter; automatisch zur eingestellten Stunde, nur wenn niemand spielt', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const at = Date.parse('2026-11-15T03:10:00Z'); // 04:10 in Berlin
    const updates = service(`v0.0.5-0-g${OLD}`, () => at);
    fs.mkdirSync(path.join(dir, 'update'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'update/agent.json'), '{}');
    stores.patchSettings('updates', { motorFollowMain: true, hour: 4 }, 'test');
    const requested: string[] = [];
    const players = { online: 2 };
    const stop = updates.startAuto(
      () => players.online,
      (by) => requested.push(by),
    );
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(requested).toEqual([]);
    players.online = 0;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(requested).toEqual(['automatisch']);
    const request = JSON.parse(fs.readFileSync(path.join(dir, 'update/request.json'), 'utf8')) as object;
    expect(request).toMatchObject({ motor: 'main' });
    stop();
  });
});
