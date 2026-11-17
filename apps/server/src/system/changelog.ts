import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countOfVersion,
  versionFromCount,
  type ChangeItem,
  type ChangelogVersion,
  type PublicChangelog,
} from '@moinmorni/shared';
import type { Api } from '../app.js';
import type { PanelAuth } from '../panel/auth.js';
import { itemsOf, type ChangeAudience } from './changes.js';
import { commitOf } from './update.js';

/**
 * „Was ist neu“: welche Version läuft und was sich von Version zu Version geändert hat – für die Versionsanzeige
 * unten in der Mitte von Webseite und Panel (`GET /api/public/changelog`, ohne Anmeldung).
 *
 * Die Liste entsteht beim Bauen ohne GitHub: install.sh und update.sh schreiben mit `scripts/changelog.sh` aus Git
 * `apps/server/changelog.txt` (im Image neben `dist/`). Fehlt die Datei (Entwicklung, von Hand gebaut), zeigt die
 * Anzeige nur die Nummer. Ob eine neue Version bereitsteht, kommt aus dem Update-Stand (`update.ts`), der GitHub
 * ohnehin sparsam fragt – hier nur ja/nein und die neue Nummer.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = 'changelog.txt';
/** Kopfzeile von scripts/changelog.sh (Fassung 1 des Formats). */
const HEADER = 'MoinMorni-Änderungen 1';
/** Trennt die Einträge (Datensatz-Trenner 0x1E). */
const RECORD = '\u001e';
const VERSION_TAG = 'V';
const MERGED_TAG = 'M';
/** Höchstens so viele Änderungen je Version – der Rest steht als Zahl dabei. */
const MAX_ITEMS = 30;
const SHORT_SHA = 7;
const DEV = 'dev';
/** Die Liste ändert sich nur mit einem Update – Browser dürfen sie kurz behalten. */
const CACHE_SECONDS = 60;

/** Ein Eintrag der Datei: Version („V“) oder hereingeholter Commit („M“), dazu die Nachricht. */
interface Entry {
  readonly tag: string;
  readonly fields: readonly string[];
  readonly message: string;
}

const entryOf = (raw: string): Entry => {
  const newline = raw.indexOf('\n');
  const head = newline < 0 ? raw : raw.slice(0, newline);
  const [tag = '', ...fields] = head.trim().split(' ');
  return { tag, fields, message: newline < 0 ? '' : raw.slice(newline + 1) };
};

const validDate = (value: string | undefined): string | null =>
  value && !Number.isNaN(Date.parse(value)) ? value : null;

/** Gleicher Text nur einmal (ein Merge holt manchmal dieselbe Änderung zweimal herein). */
const unique = (items: readonly ChangeItem[]): ChangeItem[] =>
  items.filter((item, i) => items.findIndex((other) => other.text === item.text) === i);

interface Draft {
  readonly count: number;
  readonly sha: string;
  readonly date: string | null;
  readonly merge: boolean;
  readonly own: readonly ChangeItem[];
  readonly merged: readonly ChangeItem[];
}

const finish = (d: Draft): ChangelogVersion => {
  // Sagt ein Merge selbst, was er bringt, zählt das; sonst die Stichpunkte der hereingeholten Commits.
  const all = unique(d.own.length || !d.merge ? d.own : d.merged);
  return {
    version: versionFromCount(d.count),
    count: d.count,
    sha: d.sha.slice(0, SHORT_SHA),
    date: d.date,
    items: all.slice(0, MAX_ITEMS),
    more: Math.max(0, all.length - MAX_ITEMS),
  };
};

/**
 * Liest die Ausgabe von `scripts/changelog.sh` (neueste Version zuerst). Unbekanntes Format oder kaputte Einträge:
 * leer bzw. übersprungen – „Was ist neu“ zeigt dann nur die Nummer.
 */
export function parseChangelog(text: string, audience: ChangeAudience = 'team'): ChangelogVersion[] {
  const [head = '', ...records] = text.split(RECORD);
  if (head.trim() !== HEADER) return [];
  const drafts = records.map(entryOf).reduce<Draft[]>((acc, entry) => {
    if (entry.tag === VERSION_TAG) {
      const [count, sha, date, ...parents] = entry.fields;
      const n = Number(count);
      if (!Number.isInteger(n) || n < 1 || !sha) return acc;
      return [
        ...acc,
        {
          count: n,
          sha,
          date: validDate(date),
          merge: parents.length > 1,
          own: itemsOf(entry.message, audience),
          merged: [],
        },
      ];
    }
    const last = acc.at(-1);
    if (entry.tag !== MERGED_TAG || !last) return acc;
    return [...acc.slice(0, -1), { ...last, merged: [...last.merged, ...itemsOf(entry.message, audience)] }];
  }, []);
  return drafts.map(finish);
}

/** Wo die Liste liegt: `MM_CHANGELOG_FILE`, sonst neben `dist/` (im Image) bzw. neben `src/` (Entwicklung). */
export function changelogFile(env: NodeJS.ProcessEnv = process.env): string | null {
  const set = env['MM_CHANGELOG_FILE'];
  const candidates = set ? [set] : [path.resolve(here, '..', FILE), path.resolve(here, '../..', FILE)];
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

/** Die Liste zur installierten Version – nur Einträge bis zu ihr, und nur, wenn die Datei zu ihr passt. */
export function changelogFor(
  version: string,
  file: string | null,
  audience: ChangeAudience = 'team',
): readonly ChangelogVersion[] {
  if (!file) return [];
  const all = (() => {
    try {
      return parseChangelog(fs.readFileSync(file, 'utf8'), audience);
    } catch {
      return [];
    }
  })();
  const count = countOfVersion(version);
  const commit = commitOf(version);
  if (count === null) return all;
  // Gebaut aus einem anderen Stand (die Datei ist von einem anderen Commit): lieber nichts als Falsches.
  const same = all.find((v) => v.count === count);
  if (same && commit && !commit.startsWith(same.sha) && !same.sha.startsWith(commit)) return [];
  return all.filter((v) => v.count <= count);
}

/** Wie die installierte Version heißt: „v1.8.8“ aus „v1.8.8-0-gabc1234“, sonst die neueste der Liste, sonst „dev“. */
export function installedVersion(version: string, versions: readonly ChangelogVersion[]): string {
  const count = countOfVersion(version);
  if (count !== null) return versionFromCount(count);
  return versions[0]?.version ?? DEV;
}

export interface ChangelogDeps {
  /** Gebaute Version (config.version). */
  readonly version: string;
  /** Datei mit der Liste (null = keine). */
  readonly file: string | null;
  /** Steht eine neue Version bereit? Aus dem Update-Stand, ohne GitHub zu fragen. */
  readonly update: () => { readonly available: boolean; readonly version: string | null };
}

/**
 * `GET /api/public/changelog` (Webseite, ohne Anmeldung): installierte Version und was Spieler davon verstehen –
 * ohne Dateinamen, Testzahlen, Branches. „Neue Version steht bereit“ nur, wenn MoinMorni selbst eine neue Nummer hat
 * (ist nur der Motor neuer, merken Spieler davon nichts).
 *
 * `GET /api/panel/changelog` (Team): alles, auch technische Stichpunkte und ein neuerer Motor.
 */
export function registerChangelogRoute(app: Api, auth: PanelAuth, deps: ChangelogDeps): void {
  // Einmal gelesen – die Datei ändert sich nur mit einem neuen Image.
  const team = changelogFor(deps.version, deps.file, 'team');
  const players = changelogFor(deps.version, deps.file, 'players');
  const version = installedVersion(deps.version, team);
  app.get('/api/public/changelog', async (_request, reply): Promise<PublicChangelog> => {
    const update = deps.update();
    reply.header('cache-control', `public, max-age=${CACHE_SECONDS}`);
    const ours = update.available && update.version !== null;
    return { version, versions: players, update: { available: ours, version: ours ? update.version : null } };
  });
  app.get('/api/panel/changelog', async (request, reply): Promise<PublicChangelog> => {
    await auth.require(request);
    const update = deps.update();
    reply.header('cache-control', 'private, no-store');
    return { version, versions: team, update: { available: update.available, version: update.version } };
  });
}
