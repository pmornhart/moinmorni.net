import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { MotorClient } from '../motor/client.js';
import type { Stores } from '../panel/stores.js';

/**
 * Updates: morni.net folgt dem Branch `main` auf GitHub. morni.net kennt den Commit, aus dem es gebaut wurde, und
 * fragt GitHub, was seitdem dazukam. Den eigenen Container kann es nicht tauschen – es legt eine Auftrags-Datei
 * in seinen Datenordner (`update/request.json`); der Updater auf dem Rechner (systemd aus install.sh) startet
 * dann `update.sh`: Code holen, bauen, Sicherung, neu starten, prüfen – und wenn etwas schiefgeht, zurück auf den
 * alten Stand. Den Fortschritt schreibt das Skript nach `update/status.json` und `update/log.txt`.
 * Automatisch: einmal am Tag zur eingestellten Stunde (auf Wunsch nur, wenn niemand spielt).
 */

const REPO = 'pmornhart/morni.net';
const SHORT_SHA = 7;
const MAX_CHANGES = 30;
const LOG_LINES = 40;
const MINUTE_MS = 60_000;
/** GitHub erlaubt ohne Anmeldung 60 Fragen pro Stunde – höchstens alle 30 Minuten von selbst. */
const CHECK_EVERY_MINUTES = 30;
const CHECK_EVERY_MS = CHECK_EVERY_MINUTES * MINUTE_MS;
const FAILED_RETRY_MINUTES = 10;
const FAILED_RETRY_MS = FAILED_RETRY_MINUTES * MINUTE_MS;
/** Der Updater nimmt den Auftrag in Sekunden weg; liegt er länger, hört niemand zu. */
const STUCK_MINUTES = 2;
const STUCK_MS = STUCK_MINUTES * MINUTE_MS;
const AUTO_EVERY_MINUTES = 5;
const AUTO_EVERY_MS = AUTO_EVERY_MINUTES * MINUTE_MS;
const TIMEOUT_MS = 15_000;
// Gebaute Version → Commit: "v0.1.2-0-gabc1234" → "abc1234"; "dev" passt nicht.
// https://regex101.com/?flavor=javascript&regex=-g(%5B0-9a-f%5D%7B7%2C40%7D)%24&testString=v0.1.2-0-gabc1234
const DESCRIBED = /-g([0-9a-f]{7,40})$/;
// Nur ein Commit: "abc1234" passt, "v0.1.2" nicht.
// https://regex101.com/?flavor=javascript&regex=%5E%5B0-9a-f%5D%7B7%2C40%7D%24&testString=abc1234
const COMMIT = /^[0-9a-f]{7,40}$/;
// Stichpunkt einer Commit-Nachricht: "- Neu: Gefängnis" passt, "Neu: Gefängnis" (ohne Strich) nicht.
// https://regex101.com/?flavor=javascript&regex=%5E-%20(Neu%7CBehoben%7CVerbessert%7CEntfernt)%3A%5Cs*(.%2B)%24&testString=-%20Neu%3A%20Gef%C3%A4ngnis
const BULLET = /^- (Neu|Behoben|Verbessert|Entfernt):\s*(.+)$/;
// Farb-Codes im Protokoll des Skripts: "\u001b[32m" passt, "[32m" ohne ESC nicht.
// https://regex101.com/?flavor=javascript&regex=%5Cu001b%5C%5B%5B0-9%3B%5D*m&testString=%1B%5B32m%E2%9C%94%1B%5B0m
const ANSI = /\u001b\[[0-9;]*m/g;
const KIND: Readonly<Record<string, ChangeKind>> = {
  Neu: 'new',
  Behoben: 'fixed',
  Verbessert: 'improved',
  Entfernt: 'removed',
};

export type ChangeKind = 'new' | 'fixed' | 'improved' | 'removed';

export interface UpdateChange {
  readonly sha: string;
  readonly title: string;
  readonly date: string | null;
  readonly items: ReadonlyArray<{ readonly kind: ChangeKind; readonly text: string }>;
}

export interface UpdateComponent {
  readonly current: string | null;
  readonly latest: string | null;
  readonly behind: number;
  readonly changes: readonly UpdateChange[];
}

export interface UpdateRun {
  readonly state: 'running' | 'done' | 'failed' | 'rolled_back';
  readonly step: string | null;
  readonly at: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly log: readonly string[];
}

export interface UpdateView {
  readonly version: string;
  readonly branch: string;
  readonly morninet: UpdateComponent;
  readonly motor: {
    readonly current: string | null;
    readonly latest: string | null;
    readonly behind: number;
  };
  readonly available: boolean;
  readonly checkedAt: string | null;
  readonly checkFailed: boolean;
  /** Der Updater auf dem Rechner ist eingerichtet (install.sh schreibt update/agent.json). */
  readonly canUpdate: boolean;
  /** Auftrag liegt bereit oder Skript läuft. */
  readonly updating: boolean;
  /** Auftrag liegt seit Minuten, niemand holt ihn ab. */
  readonly stuck: boolean;
  readonly run: UpdateRun | null;
}

const commitSchema = z.object({
  sha: z.string(),
  commit: z.object({ message: z.string(), committer: z.object({ date: z.string() }).nullable() }),
});
const compareSchema = z.object({ ahead_by: z.number(), commits: z.array(commitSchema) });
const statusSchema = z.object({
  state: z.enum(['running', 'done', 'failed', 'rolled_back']),
  step: z.string().nullable().optional(),
  at: z.string(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
});
const requestSchema = z.object({ at: z.string() });
const motorUpdateSchema = z.object({
  current: z.string(),
  latest: z.string().nullable(),
  behind: z.number(),
});

/** Stichpunkte aus der Commit-Nachricht (Neu/Behoben/Verbessert/Entfernt); ohne Stichpunkte die erste Zeile. */
export function changeOf(sha: string, message: string, date: string | null): UpdateChange {
  const lines = message.split('\n');
  const items = lines
    .map((l) => BULLET.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ kind: KIND[m[1] ?? ''] ?? 'improved', text: m[2] ?? '' }));
  return { sha: sha.slice(0, SHORT_SHA), title: lines[0]?.trim() ?? '', date, items };
}

/** Commit aus der gebauten Version („v0.1.2-0-gabc1234“ oder „abc1234“), null bei „dev“. */
export function commitOf(version: string): string | null {
  const described = DESCRIBED.exec(version);
  if (described) return described[1] ?? null;
  return COMMIT.test(version) ? version : null;
}

export interface UpdateService {
  readonly view: () => Promise<UpdateView>;
  /** Jetzt bei GitHub nachsehen (Knopf „Nach Updates suchen“). */
  readonly check: () => Promise<UpdateView>;
  /** Update anstoßen (Knopf oder automatisch). */
  readonly start: (by: string) => UpdateView;
  /** Was das letzte Update gebracht hat – einmal nach dem Neustart, für die Meldung in Discord. */
  readonly takeResult: () => UpdateRun | null;
  readonly startAuto: (online: () => number, onRequested: (by: string) => void) => () => void;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function createUpdateService(
  config: Config,
  motor: MotorClient,
  stores: Stores,
  fetchImpl: FetchLike = fetch,
  now: () => number = Date.now,
): UpdateService {
  const dir = path.join(config.dataDir, 'update');
  const file = (name: string): string => path.join(dir, name);
  const readJson = <T>(name: string, schema: z.ZodType<T>): T | null => {
    try {
      return schema.parse(JSON.parse(fs.readFileSync(file(name), 'utf8')));
    } catch {
      return null;
    }
  };
  const write = (name: string, body: unknown): void => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file(`${name}.${process.pid}.tmp`);
    fs.writeFileSync(tmp, `${JSON.stringify(body)}\n`);
    fs.renameSync(tmp, file(name));
  };

  const current = commitOf(config.version);
  const state: {
    component: UpdateComponent;
    motor: UpdateView['motor'];
    checkedAt: number | null;
    failedAt: number | null;
  } = {
    component: { current, latest: null, behind: 0, changes: [] },
    motor: { current: null, latest: null, behind: 0 },
    checkedAt: null,
    failedAt: null,
  };

  const github = async <T>(urlPath: string, schema: z.ZodType<T>): Promise<T> => {
    const res = await fetchImpl(`${config.githubApi}/repos/${REPO}${urlPath}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'morninet-updater' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    return schema.parse(await res.json());
  };

  const fetchNow = async (): Promise<void> => {
    const branch = encodeURIComponent(config.updateBranch);
    if (current) {
      const cmp = await github(`/compare/${current}...${branch}`, compareSchema);
      const commits = cmp.commits.filter((c) => !c.commit.message.startsWith('Merge '));
      state.component = {
        current,
        latest: (cmp.commits.at(-1)?.sha ?? current).slice(0, SHORT_SHA),
        behind: cmp.ahead_by,
        changes: commits
          .slice(-MAX_CHANGES)
          .reverse()
          .map((c) => changeOf(c.sha, c.commit.message, c.commit.committer?.date ?? null)),
      };
    } else {
      const head = await github(`/commits/${branch}`, commitSchema);
      state.component = { current: null, latest: head.sha.slice(0, SHORT_SHA), behind: 0, changes: [] };
    }
    // Der Motor kennt seinen Stand selbst (und fragt bei MorniHosting nach).
    try {
      const m = motorUpdateSchema.safeParse(await motor.request('GET', '/api/system/update'));
      if (m.success) state.motor = { current: m.data.current, latest: m.data.latest, behind: m.data.behind };
    } catch {
      // Motor gerade nicht erreichbar: alter Stand bleibt stehen.
    }
    state.checkedAt = now();
    state.failedAt = null;
  };
  const refresh = async (force: boolean): Promise<void> => {
    const fresh = state.checkedAt !== null && now() - state.checkedAt < CHECK_EVERY_MS;
    const failedRecently = state.failedAt !== null && now() - state.failedAt < FAILED_RETRY_MS;
    if (!force && (fresh || failedRecently)) return;
    try {
      await fetchNow();
    } catch {
      state.failedAt = now();
    }
  };

  const followMotor = (): boolean => stores.settings('updates')['motorFollowMain'] === true;
  const run = (): UpdateRun | null => {
    const s = readJson('status.json', statusSchema);
    if (!s) return null;
    const log = fs.existsSync(file('log.txt'))
      ? fs
          .readFileSync(file('log.txt'), 'utf8')
          .replace(ANSI, '')
          .split('\n')
          .filter(Boolean)
          .slice(-LOG_LINES)
      : [];
    return { state: s.state, step: s.step ?? null, at: s.at, from: s.from ?? null, to: s.to ?? null, log };
  };
  const build = (): UpdateView => {
    const request = readJson('request.json', requestSchema);
    const r = run();
    const waiting = request !== null;
    const available = state.component.behind > 0 || (followMotor() && state.motor.behind > 0);
    return {
      version: config.version,
      branch: config.updateBranch,
      morninet: state.component,
      motor: state.motor,
      available,
      checkedAt: state.checkedAt === null ? null : new Date(state.checkedAt).toISOString(),
      checkFailed: state.failedAt !== null,
      canUpdate: fs.existsSync(file('agent.json')),
      updating: waiting || r?.state === 'running',
      stuck: waiting && now() - Date.parse(request.at) > STUCK_MS,
      run: r,
    };
  };

  const start = (by: string): UpdateView => {
    const v = build();
    if (v.updating) return v;
    write('request.json', {
      at: new Date(now()).toISOString(),
      by,
      motor: followMotor() ? 'main' : 'pinned',
    });
    return build();
  };

  return {
    view: async () => {
      await refresh(false);
      return build();
    },
    check: async () => {
      await refresh(true);
      return build();
    },
    start,
    takeResult: () => {
      const r = run();
      if (!r || r.state === 'running') return null;
      const seen = readJson('announced.json', z.object({ at: z.string() }));
      if (seen?.at === r.at) return null;
      write('announced.json', { at: r.at });
      return r;
    },
    startAuto: (online, onRequested) => {
      const day = (t: number): string =>
        new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone, dateStyle: 'short' }).format(t);
      const hourNow = (t: number): number =>
        Number(
          new Intl.DateTimeFormat('en-GB', {
            timeZone: config.timeZone,
            hour: 'numeric',
            hour12: false,
          }).format(t),
        );
      const last: { day: string | null } = { day: null };
      const tick = async (): Promise<void> => {
        const s = stores.settings('updates');
        const t = now();
        if (s['auto'] !== true || hourNow(t) !== Number(s['hour']) || last.day === day(t)) return;
        if (s['whenEmpty'] === true && online() > 0) return;
        const v = await (async () => {
          await refresh(false);
          return build();
        })();
        if (!v.available || !v.canUpdate || v.updating) return;
        last.day = day(t);
        start('automatisch');
        onRequested('automatisch');
      };
      const timer = setInterval(() => {
        tick().catch(() => undefined);
      }, AUTO_EVERY_MS);
      timer.unref();
      return () => clearInterval(timer);
    },
  };
}
