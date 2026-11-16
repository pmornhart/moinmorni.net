/**
 * Gegen das echte GitHub ausprobieren, was MoinMorni dort fragt (nicht Teil des Servers): neueste Commits über Git,
 * Releases aller Spielmodi (Tag über Git, Jar direkt von der Release-Seite – passt der Name aus MODE_JARS?) und die
 * Update-Karte des Panels für eine laufende Fassung.
 *   NODE_USE_ENV_PROXY=1 tsx scripts/github-probe.ts <ordner> [laufender-commit] [kanal]
 * Im Ordner bleiben die gemerkten Antworten (github/cache.json, github/releases.json) – ein zweiter Lauf fragt die API
 * nicht noch einmal.
 */
import path from 'node:path';
import { MODE_JARS, MODE_REPOS } from '@moinmorni/shared';
import { createGithubClient } from '../src/lib/github.js';
import { githubReleases } from '../src/network/mode-releases.js';

const dir = process.argv[2] ?? '/tmp/github-probe';
const github = createGithubClient({
  api: 'https://api.github.com',
  web: 'https://github.com',
  token: null,
  dir: path.join(dir, 'github'),
});
const log = {
  warn: (o: unknown, m: string) =>
    console.log(
      'WARN',
      m,
      JSON.stringify(o, (k, v) => (v instanceof Error ? v.message : v)),
    ),
  info: () => undefined,
} as never;

const refs = await github.refs('pmornhart/moinmorni.net');
console.log('moinmorni.net refs:', refs.size, 'main =', refs.get('refs/heads/main') ?? '(kein main)');
console.log('  Zweige:', [...refs.keys()].filter((r) => r.startsWith('refs/heads/')).join(', '));
const motor = await github.refs('pmornhart/MorniHosting');
console.log('MorniHosting main =', motor.get('refs/heads/main'));

const releases = githubReleases(log, github, { stateFile: path.join(dir, 'github', 'releases.json') });
for (const [mode, repo] of Object.entries(MODE_REPOS)) {
  const t0 = Date.now();
  try {
    const r = await releases.latest(repo, MODE_JARS[mode]);
    console.log(
      mode.padEnd(12),
      repo.padEnd(32),
      r ? `${r.tag} ${r.fileName} ${r.bytes.length} B` : '— kein Release',
      `${Date.now() - t0} ms`,
    );
  } catch (err) {
    console.log(mode, repo, 'FEHLER', (err as Error).message);
  }
}
console.log('API-Grenze bis:', github.limitedUntil());

// Updates wie im Panel: laufende Fassung = erster Parameter (Commit), Kanal = zweiter.
const { loadConfig } = await import('../src/config.js');
const { createUpdateService } = await import('../src/system/update.js');
const { openDatabase } = await import('../src/db/index.js');
const { createStores } = await import('../src/panel/stores.js');
const { createEventBus } = await import('../src/lib/events.js');
const running = process.argv[3] ?? 'aee20ef';
const branch = process.argv[4] ?? 'main';
const config = loadConfig(
  {
    MM_SECRET: 'nur-zum-ausprobieren-nur-zum-ausprobieren-123',
    MM_MOTOR_TOKEN: 'x',
    MM_DATA_DIR: dir,
    MM_VERSION: `v0.0.0-0-g${running}`,
    MM_UPDATE_BRANCH: branch,
  },
  dir,
);
const motorStub = { request: async () => ({ version: 'v0.9.9-0-g1046a49' }) } as never;
const stores = createStores(openDatabase(':memory:').db, createEventBus());
const updates = createUpdateService(config, motorStub, stores, github);
const view = await updates.view();
console.log(
  JSON.stringify(
    { ...view, moinmorni: { ...view.moinmorni, changes: view.moinmorni.changes.slice(0, 3) } },
    null,
    2,
  ).slice(0, 3000),
);
console.log('Änderungen insgesamt:', view.moinmorni.changes.length);
