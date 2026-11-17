import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Config } from '../config.js';
import { GithubLimited, type GithubClient, type GithubKeyState } from '../lib/github.js';
import type { MotorClient } from '../motor/client.js';
import type { Stores } from '../panel/stores.js';

/**
 * Updates: MoinMorni folgt seinem Branch auf GitHub (`MM_UPDATE_BRANCH`, sonst `main`). MoinMorni kennt den Commit,
 * aus dem es gebaut wurde, und schaut, was seitdem dazukam. Den eigenen Container kann es nicht tauschen – es legt
 * eine Auftrags-Datei in seinen Datenordner (`update/request.json`); der Updater auf dem Rechner (systemd aus
 * install.sh) startet dann `update.sh`: Code holen, bauen, Sicherung, neu starten, prüfen – und wenn etwas
 * schiefgeht, zurück auf den alten Stand. Den Fortschritt schreibt das Skript nach `update/status.json` und
 * `update/log.txt`. Automatisch: einmal am Tag zur eingestellten Stunde (auf Wunsch nur, wenn niemand spielt).
 *
 * Sparsam mit GitHub (ohne Schlüssel 60 API-Fragen pro Stunde, geteilt mit allem hinter derselben Adresse):
 * - Ob es etwas Neues gibt, sagt Git selbst (Smart HTTP, `lib/github.ts`) – für MoinMorni und für den Motor
 *   (MorniHosting `main`). Welchen Stand der Motor hat, sagt er selbst (`/api/system/status`), ohne GitHub zu fragen.
 * - Nur wenn es einen neuen Commit gibt, holt MoinMorni die Liste der Änderungen über die API: ein Vergleich zweier
 *   fester Commits, der auf der Platte bleibt (auch nach einem Neustart) und nie zweimal gefragt wird.
 * - Bremst GitHub, kommt die Liste nach der Zeit, die GitHub nennt – „Update starten“ geht trotzdem schon.
 */

const REPO = 'pmornhart/moinmorni.net';
const MOTOR_REPO = 'pmornhart/MorniHosting';
/** Der Motor folgt MorniHosting `main` (Submodul, `.gitmodules`; update.sh: `git submodule update --remote`). */
const MOTOR_BRANCH = 'main';
const SHORT_SHA = 7;
const MAX_CHANGES = 30;
const LOG_LINES = 40;
const MINUTE_MS = 60_000;
/** Git fragen kostet nichts von der API-Grenze – trotzdem höchstens alle 10 Minuten von selbst. */
const CHECK_EVERY_MINUTES = 10;
const CHECK_EVERY_MS = CHECK_EVERY_MINUTES * MINUTE_MS;
/** War GitHub nicht zu erreichen, von selbst erst nach 5 Minuten wieder (der Knopf fragt sofort). */
const FAILED_RETRY_MINUTES = 5;
const FAILED_RETRY_MS = FAILED_RETRY_MINUTES * MINUTE_MS;
/** Hakte die Liste der Änderungen (nicht wegen der Grenze), von selbst nach 10 Minuten noch mal. */
const LIST_RETRY_MINUTES = 10;
const LIST_RETRY_MS = LIST_RETRY_MINUTES * MINUTE_MS;
/** Der Updater nimmt den Auftrag in Sekunden weg; liegt er länger, hört niemand zu. */
const STUCK_MINUTES = 2;
const STUCK_MS = STUCK_MINUTES * MINUTE_MS;
const AUTO_EVERY_MINUTES = 5;
const AUTO_EVERY_MS = AUTO_EVERY_MINUTES * MINUTE_MS;
const MERGE_PREFIX = 'Merge ';
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
  /** So viele Änderungen ist die neueste Fassung weiter; null = sie ist neuer, wie viel steht noch nicht fest. */
  readonly behind: number | null;
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
  readonly moinmorni: UpdateComponent;
  readonly motor: {
    readonly current: string | null;
    readonly latest: string | null;
    /** null = MorniHosting ist neuer, wie viel steht noch nicht fest. */
    readonly behind: number | null;
  };
  readonly available: boolean;
  readonly checkedAt: string | null;
  /** GitHub war gar nicht zu erreichen (auch Git nicht) – ob es etwas Neues gibt, ist offen. */
  readonly checkFailed: boolean;
  /** Den Branch, dem die Updates folgen, gibt es auf GitHub (noch) nicht. */
  readonly branchMissing: boolean;
  /** Es gibt eine neue Fassung, nur ihre Liste der Änderungen fehlt noch (GitHub bremst oder hakte). */
  readonly changesPending: boolean;
  /** Bis dahin nimmt GitHub keine Fragen an (ISO) – danach kommt die Liste. null = MoinMorni darf fragen. */
  readonly limitedUntil: string | null;
  /** GitHub-Schlüssel aus der .env: keiner, eingetragen, von GitHub abgelehnt (den Schlüssel selbst nie). */
  readonly githubKey: GithubKeyState;
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
type Compare = z.infer<typeof compareSchema>;
/** Nur die Zahl (Motor): `?per_page=1&page=2` kommt ohne die lange Liste der geänderten Dateien. */
const countSchema = z.object({ ahead_by: z.number() });
const statusSchema = z.object({
  state: z.enum(['running', 'done', 'failed', 'rolled_back']),
  step: z.string().nullable().optional(),
  at: z.string(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
});
const requestSchema = z.object({ at: z.string() });
/** Was der Motor über sich selbst sagt (öffentlich, ohne GitHub): `version` z. B. „v0.9.4-0-g0ab0370“. */
const motorStatusSchema = z.object({ version: z.string() });

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

/** Neuer als der laufende Stand? null heißt: neuer, nur wie viel steht noch nicht fest. */
const isNewer = (behind: number | null): boolean => behind === null || behind > 0;

/** Was zu vergleichen ist: laufender Commit → neuester. null, wenn es nichts Neues gibt (oder einer fehlt). */
function pairOf(base: string | null, head: string | null): { base: string; head: string } | null {
  return base && head && !head.startsWith(base) ? { base, head } : null;
}

/** Für die Platte reicht, was angezeigt wird: die neuesten Änderungen ohne Merge-Commits. */
const keepChanges = (cmp: Compare): Compare => ({
  ahead_by: cmp.ahead_by,
  commits: cmp.commits.filter((c) => !c.commit.message.startsWith(MERGE_PREFIX)).slice(-MAX_CHANGES),
});

const changesOf = (cmp: Compare): UpdateChange[] =>
  cmp.commits
    .filter((c) => !c.commit.message.startsWith(MERGE_PREFIX))
    .slice(-MAX_CHANGES)
    .reverse()
    .map((c) => changeOf(c.sha, c.commit.message, c.commit.committer?.date ?? null));

/** Ein Vergleich zweier fester Commits: `behind` null = GitHub kennt den laufenden Commit nicht. */
interface Compared {
  readonly base: string;
  readonly head: string;
  readonly behind: number | null;
  readonly changes: readonly UpdateChange[];
}

const matches = (known: Compared | null, pair: { base: string; head: string } | null): known is Compared =>
  known !== null && pair !== null && known.base === pair.base && known.head === pair.head;

/** Wie viel neuer: 0 ohne neuen Commit, sonst die Zahl aus dem Vergleich – null, solange er fehlt. */
function behindOf(pair: { base: string; head: string } | null, known: Compared | null): number | null {
  if (!pair) return 0;
  return matches(known, pair) ? known.behind : null;
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

export function createUpdateService(
  config: Config,
  motor: MotorClient,
  stores: Stores,
  github: GithubClient,
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
    /** Neuester Commit des Branches (laut Git), null = unbekannt oder Branch fehlt. */
    head: string | null;
    branchMissing: boolean;
    checkedAt: number | null;
    failedAt: number | null;
    list: Compared | null;
    listFailedAt: number | null;
    motorVersion: string | null;
    motorHead: string | null;
    motorCount: Compared | null;
    /** Läuft gerade ein Nachsehen, warten weitere darauf (statt doppelt zu fragen). */
    busy: Promise<void> | null;
  } = {
    head: null,
    branchMissing: false,
    checkedAt: null,
    failedAt: null,
    list: null,
    listFailedAt: null,
    motorVersion: null,
    motorHead: null,
    motorCount: null,
    busy: null,
  };
  const motorCommit = (): string | null => (state.motorVersion ? commitOf(state.motorVersion) : null);

  /** Neueste Commits über Git (keine API-Frage) und den Stand des Motors (fragt GitHub nicht). */
  const lookAtHeads = async (): Promise<void> => {
    const [own, engine, status] = await Promise.allSettled([
      github.refs(REPO),
      github.refs(MOTOR_REPO),
      motor.request<unknown>('GET', '/api/system/status'),
    ]);
    if (own.status === 'fulfilled') {
      state.head = own.value.get(`refs/heads/${config.updateBranch}`) ?? null;
      state.branchMissing = state.head === null;
      state.checkedAt = now();
      state.failedAt = null;
    } else {
      state.failedAt = now();
    }
    if (engine.status === 'fulfilled')
      state.motorHead = engine.value.get(`refs/heads/${MOTOR_BRANCH}`) ?? null;
    const version = status.status === 'fulfilled' ? motorStatusSchema.safeParse(status.value) : null;
    if (version?.success) state.motorVersion = version.data.version;
  };

  /** Liste der Änderungen (und beim Motor die Zahl) – nur wenn es einen neuen Commit gibt und sie noch fehlt. */
  const loadLists = async (force: boolean): Promise<void> => {
    const own = pairOf(current, state.head);
    const retryLater = !force && state.listFailedAt !== null && now() - state.listFailedAt < LIST_RETRY_MS;
    if (own && !matches(state.list, own) && !retryLater) {
      try {
        const cmp = await github.api(`/repos/${REPO}/compare/${own.base}...${own.head}`, compareSchema, {
          settled: true,
          keep: keepChanges,
        });
        state.list = cmp
          ? { ...own, behind: cmp.ahead_by, changes: changesOf(cmp) }
          : { ...own, behind: null, changes: [] };
        state.listFailedAt = null;
      } catch (err) {
        // Bremst GitHub, steht die Zeit im Client; sonst später noch mal.
        if (!(err instanceof GithubLimited)) state.listFailedAt = now();
      }
    }
    const engine = pairOf(motorCommit(), state.motorHead);
    if (engine && !matches(state.motorCount, engine)) {
      try {
        const cmp = await github.api(
          `/repos/${MOTOR_REPO}/compare/${engine.base}...${engine.head}?per_page=1&page=2`,
          countSchema,
          { settled: true },
        );
        state.motorCount = { ...engine, behind: cmp ? cmp.ahead_by : null, changes: [] };
      } catch {
        // Die Zahl kommt beim nächsten Nachsehen.
      }
    }
  };

  const refreshNow = async (force: boolean): Promise<void> => {
    const fresh = state.checkedAt !== null && now() - state.checkedAt < CHECK_EVERY_MS;
    const failedRecently = state.failedAt !== null && now() - state.failedAt < FAILED_RETRY_MS;
    if (force || !(fresh || failedRecently)) await lookAtHeads();
    await loadLists(force);
  };
  const refresh = async (force: boolean): Promise<void> => {
    const running = state.busy;
    if (running) {
      await running;
      // Der Knopf will wirklich neu nachsehen – erst nach dem laufenden.
      if (!force) return;
    }
    const mine = refreshNow(force);
    state.busy = mine;
    try {
      await mine;
    } finally {
      if (state.busy === mine) state.busy = null;
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
    const own = pairOf(current, state.head);
    const list = matches(state.list, own) ? state.list : null;
    const engine = pairOf(motorCommit(), state.motorHead);
    const moinmorni: UpdateComponent = {
      current,
      latest: state.head?.slice(0, SHORT_SHA) ?? null,
      behind: behindOf(own, state.list),
      changes: list?.changes ?? [],
    };
    const motorBehind = behindOf(engine, state.motorCount);
    const limited = github.limitedUntil();
    return {
      version: config.version,
      branch: config.updateBranch,
      moinmorni,
      motor: {
        current: state.motorVersion,
        latest: state.motorHead?.slice(0, SHORT_SHA) ?? null,
        behind: motorBehind,
      },
      available: isNewer(moinmorni.behind) || (followMotor() && isNewer(motorBehind)),
      checkedAt: state.checkedAt === null ? null : new Date(state.checkedAt).toISOString(),
      checkFailed: state.failedAt !== null,
      branchMissing: state.branchMissing,
      changesPending: own !== null && list === null,
      limitedUntil: limited === null ? null : new Date(limited).toISOString(),
      githubKey: github.key(),
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
      const tickNow = async (): Promise<void> => {
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
      const tick = async (): Promise<void> => {
        try {
          await tickNow();
        } catch {
          // Nächster Versuch in fünf Minuten.
        }
      };
      const timer = setInterval(() => {
        void tick();
      }, AUTO_EVERY_MS);
      timer.unref();
      return () => clearInterval(timer);
    },
  };
}
