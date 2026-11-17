import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * GitHub, sparsam. Ohne Anmeldung beantwortet GitHub nur 60 API-Fragen pro Stunde je Internet-Adresse – und hinter
 * Philips NetBird-Ausgang teilen sich alle Rechner eine Adresse (MorniHosting fragt dort auch). Darum:
 *
 * - **Ob es etwas Neues gibt, sagt Git selbst:** die Liste der Zweige und Tags über Smart HTTP
 *   (`<repo>.git/info/refs?service=git-upload-pack`, dasselbe wie `git ls-remote`). Das ist keine API-Frage und
 *   zählt nicht zu den 60.
 * - **API-Antworten bleiben auf der Platte** (`<Daten>/github/cache.json`, nur öffentliche Daten) samt ETag und
 *   überstehen einen Neustart. Was sich nie mehr ändern kann (ein Vergleich zweier fester Commits), wird nie zweimal
 *   gefragt. Sonst fragt MoinMorni bedingt (If-None-Match): Ist nichts neu, antwortet GitHub kurz mit 304 – laut
 *   GitHub zählt das aber nur mit Schlüssel nicht mit.
 * - **Bremst GitHub** (403/429 mit Grenz-Angaben), fragt MoinMorni die API bis zur genannten Zeit gar nicht mehr –
 *   auch nach einem Neustart nicht.
 * - **Freiwillig ein Schlüssel** (nur lesen) in der .env (`MM_GITHUB_TOKEN`): 5000 Fragen pro Stunde. Er geht nur an
 *   die API, nie an Git oder andere Adressen, und steht nie in Antworten, Fehlern oder Protokollen. Nimmt GitHub ihn
 *   nicht an (abgelaufen), fragt MoinMorni ohne ihn weiter.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Ohne Schlüssel · mit Schlüssel · Schlüssel steht in der .env, GitHub nimmt ihn aber nicht an. */
export type GithubKeyState = 'none' | 'set' | 'rejected';

const TIMEOUT_MS = 15_000;
const SECOND_MS = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MINUTE_MS = SECONDS_PER_MINUTE * SECOND_MS;
const HOUR_MS = MINUTES_PER_HOUR * MINUTE_MS;
const EXTRA_WAIT_MINUTES = 5;
/** GitHub zählt in Stunden-Fenstern: länger als eine Stunde (und etwas Luft) wartet MoinMorni nie. */
const LONGEST_WAIT_MS = HOUR_MS + EXTRA_WAIT_MINUTES * MINUTE_MS;
/** So viele Antworten bleiben auf der Platte (die zuletzt gebrauchten). */
const KEEP_ENTRIES = 40;
const BYTES_PER_KB = 1024;
const MAX_REFS_KB = 4096;
/** Die Liste der Zweige und Tags ist klein (unter 10 KB) – mehr als 4 MB ist kein Git. */
const MAX_REFS_BYTES = MAX_REFS_KB * BYTES_PER_KB;
const HTTP_NOT_MODIFIED = 304;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY = 429;
const PKT_HEADER = 4;
const HEX = 16;
const LINE_END = 1;
const USER_AGENT = 'MoinMorni (+https://github.com/pmornhart/moinmorni.net)';
const ADVERTISEMENT = 'application/x-git-upload-pack-advertisement';

// Repo wie "pmornhart/moinmorni.net" – nichts, was den Pfad verlassen könnte ("../x" passt nicht).
// https://regex101.com/?flavor=javascript&regex=%5E%5BA-Za-z0-9-%5D%2B%2F%5BA-Za-z0-9_-%5D%5BA-Za-z0-9._-%5D*%24&testString=pmornhart%2Fmoinmorni.net
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
// Ein Schlüssel von GitHub: "ghp_…", "github_pat_…" – nur Buchstaben, Ziffern, Unterstrich (alles andere wäre im
// Kopf der Anfrage ungültig, und der Fehler nennte den Wert). "ghp_abc123" passt, "ghp abc" nicht.
// https://regex101.com/?flavor=javascript&regex=%5E%5BA-Za-z0-9_%5D%2B%24&testString=ghp_abc123
const TOKEN = /^[A-Za-z0-9_]+$/;
// Ein Paket der Ref-Liste (pkt-line) ohne sein Zeilenende: davor dürfen Flush-Pakete "0000" stehen, dann vier
// Hex-Ziffern Länge (zählt sich selbst und das Zeilenende mit), dann der Inhalt. "0000003f<Commit> refs/heads/main"
// passt mit Länge 0x3f.
// https://regex101.com/?flavor=javascript&regex=%5E(%3F%3A0000)*(%5B0-9a-f%5D%7B4%7D)(.*)%24&flags=s&testString=0000003fabc%20refs%2Fheads%2Fmain
const PACKET = /^(?:0000)*([0-9a-f]{4})(.*)$/s;
// Nach dem letzten Zeilenende nur noch Flush-Pakete: "0000" oder nichts.
// https://regex101.com/?flavor=javascript&regex=%5E(%3F%3A0000)*%24&testString=0000
const FLUSHES = /^(?:0000)*$/;
// Ein Ref: "<Commit> <Name>", beim ersten folgen "\0" und die Fähigkeiten des Servers.
// "aee20ef…f0 refs/heads/main" passt; "# service=git-upload-pack" nicht.
// https://regex101.com/?flavor=javascript&regex=%5E(%5B0-9a-f%5D%7B40%7D%7C%5B0-9a-f%5D%7B64%7D)%20(%5B%5E%5Cs%5C0%5D%2B)&testString=aee20efb8a829e25902171db5f36d01cdc86e0f0%20refs%2Fheads%2Fmain
const REF_LINE = /^([0-9a-f]{40}|[0-9a-f]{64}) ([^\s\0]+)/;
// GitHub sagt im Text, dass es bremst: "API rate limit exceeded …", "You have exceeded a secondary rate limit".
// https://regex101.com/?flavor=javascript&regex=rate%20limit&flags=i&testString=API%20rate%20limit%20exceeded%20for%20203.0.113.25.
const RATE_LIMIT_TEXT = /rate limit/i;

/** GitHub nimmt gerade keine Fragen an – erst wieder ab `until` (ms seit 1970). */
export class GithubLimited extends Error {
  override readonly name = 'GithubLimited';
  constructor(readonly until: number) {
    super('github_limited');
  }
}

/** Alles andere, was schiefging (keine Verbindung, Fehler bei GitHub). Nennt nur Status und Art, nie Kopfzeilen. */
export class GithubError extends Error {
  override readonly name = 'GithubError';
  constructor(
    readonly status: number | null,
    code: string,
  ) {
    super(code);
  }
}

/**
 * Zweige und Tags aus der Antwort von `info/refs?service=git-upload-pack` (Byte für Byte als latin1 gelesen):
 * „refs/heads/main“ → Commit. Jede Zeile wird an ihrer Längenangabe geprüft – passt eine nicht, lieber ein Fehler als
 * ein falscher Commit.
 */
export function parseRefs(advertisement: string): Map<string, string> {
  const lines = advertisement.split('\n');
  const tail = lines.pop() ?? '';
  if (!FLUSHES.test(tail)) throw new GithubError(null, 'refs_broken');
  const contents = lines.map((line) => {
    const packet = PACKET.exec(line);
    const size = Number.parseInt(packet?.[1] ?? '', HEX);
    const content = packet?.[2] ?? '';
    if (!packet || size !== PKT_HEADER + content.length + LINE_END)
      throw new GithubError(null, 'refs_broken');
    return content;
  });
  return new Map(
    contents.flatMap((content): Array<[string, string]> => {
      const ref = REF_LINE.exec(content);
      return ref ? [[ref[2] ?? '', ref[1] ?? '']] : [];
    }),
  );
}

/** Body lesen, aber nie mehr als `max` Bytes (eine falsche Antwort soll den Speicher nicht füllen). */
async function readCapped(res: Response, max: number): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  const pull = async (size: number): Promise<Buffer> => {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    if (size + value.byteLength > max) {
      await reader.cancel();
      throw new GithubError(res.status, 'refs_too_big');
    }
    chunks.push(value);
    return pull(size + value.byteLength);
  };
  return pull(0);
}

const entrySchema = z.object({ etag: z.string().nullable(), at: z.number(), body: z.unknown() });
const cacheSchema = z.object({
  limitedUntil: z.number().nullable().catch(null),
  entries: z.record(z.string(), entrySchema).catch({}),
});
type Cache = z.infer<typeof cacheSchema>;

export interface ApiOptions<T> {
  /**
   * Die Antwort kann sich nie mehr ändern (z. B. ein Vergleich zweier fester Commits): Liegt sie schon auf der Platte,
   * fragt MoinMorni gar nicht – auch nicht, während GitHub bremst.
   */
  readonly settled?: boolean;
  /** Was davon auf die Platte kommt (kleiner machen) – muss wieder zum Schema passen. */
  readonly keep?: (value: T) => T;
}

export interface GithubClient {
  /** Zweige und Tags eines Repos („refs/heads/main“ → Commit), über Git selbst – ohne API-Grenze. */
  readonly refs: (repo: string) => Promise<ReadonlyMap<string, string>>;
  /** GET auf die API (Pfad ab „/repos/…“). null = gibt es nicht (404). Bremst GitHub: wirft GithubLimited. */
  readonly api: <T>(apiPath: string, schema: z.ZodType<T>, options?: ApiOptions<T>) => Promise<T | null>;
  /** Bis wann GitHub keine API-Fragen annimmt (ms seit 1970) – null, solange MoinMorni fragen darf. */
  readonly limitedUntil: () => number | null;
  readonly key: () => GithubKeyState;
}

export interface GithubOptions {
  /** z. B. https://api.github.com */
  readonly api: string;
  /** z. B. https://github.com */
  readonly web: string;
  readonly token: string | null;
  /** Ordner für die gemerkten Antworten (`<Daten>/github`). */
  readonly dir: string;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => number;
}

/** Schlüssel aus der .env: keiner, brauchbar – oder einer, den GitHub so nie annimmt (nie mitschicken). */
function keyStateOf(raw: string | null, usable: string | null): GithubKeyState {
  if (!raw) return 'none';
  return usable ? 'set' : 'rejected';
}

export function createGithubClient(options: GithubOptions): GithubClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const file = path.join(options.dir, 'cache.json');
  const token = options.token && TOKEN.test(options.token) ? options.token : null;
  const keyState: { value: GithubKeyState } = { value: keyStateOf(options.token, token) };

  /** Eine Anfrage mit Zeitlimit. Keine Verbindung: nur die Art weitergeben – der Fehler von fetch nennt sonst mehr. */
  const call = async (url: string, init: RequestInit): Promise<Response> => {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new GithubError(
        null,
        err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'offline',
      );
    }
  };

  const load = (): Cache => {
    try {
      return cacheSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      return { limitedUntil: null, entries: {} };
    }
  };
  const cache: Cache = load();
  const save = (): void => {
    try {
      // Nur die zuletzt gebrauchten Antworten bleiben.
      const kept = Object.entries(cache.entries)
        .sort(([, a], [, b]) => b.at - a.at)
        .slice(0, KEEP_ENTRIES);
      cache.entries = Object.fromEntries(kept);
      fs.mkdirSync(options.dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(cache)}\n`);
      fs.renameSync(tmp, file);
    } catch {
      // Platte voll oder schreibgeschützt: dann eben nur im Speicher – beim nächsten Mal wird wieder gefragt.
    }
  };

  const limitedUntil = (): number | null =>
    cache.limitedUntil !== null && cache.limitedUntil > now() ? cache.limitedUntil : null;
  /** Bremse merken (auch über einen Neustart): mindestens eine Minute, höchstens etwas über eine Stunde. */
  const limit = (until: number): GithubLimited => {
    const at = Math.min(Math.max(until, now() + MINUTE_MS), now() + LONGEST_WAIT_MS);
    cache.limitedUntil = at;
    save();
    return new GithubLimited(at);
  };
  /** Ab wann wieder gefragt werden darf, wenn GitHub bremst – sonst null (z. B. ein 403 aus anderem Grund). */
  const brakeOf = async (res: Response): Promise<number | null> => {
    if (res.status !== HTTP_FORBIDDEN && res.status !== HTTP_TOO_MANY) return null;
    const retryAfter = Number(res.headers.get('retry-after') ?? Number.NaN);
    if (Number.isFinite(retryAfter) && retryAfter >= 0) return now() + retryAfter * SECOND_MS;
    const reset = Number(res.headers.get('x-ratelimit-reset') ?? Number.NaN);
    if (res.headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset)) return reset * SECOND_MS;
    // „Sonst mindestens eine Minute warten“ (GitHub) – beim 403 nur, wenn der Text von einer Grenze spricht.
    const text = await res.text().catch(() => '');
    return res.status === HTTP_TOO_MANY || RATE_LIMIT_TEXT.test(text) ? now() + MINUTE_MS : null;
  };

  const ask = (url: string, etag: string | null, withKey: boolean): Promise<Response> =>
    call(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': USER_AGENT,
        ...(etag ? { 'if-none-match': etag } : {}),
        ...(withKey && token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
  const send = async (url: string, etag: string | null): Promise<Response> => {
    const withKey = keyState.value === 'set';
    const res = await ask(url, etag, withKey);
    if (!withKey || res.status !== HTTP_UNAUTHORIZED) return res;
    // Schlüssel abgelaufen oder gelöscht: ohne ihn weiter (öffentliche Repos gehen auch so).
    keyState.value = 'rejected';
    return ask(url, etag, false);
  };

  return {
    refs: async (repo) => {
      if (!REPO.test(repo)) throw new GithubError(null, 'repo_invalid');
      const res = await call(`${options.web}/${repo}.git/info/refs?service=git-upload-pack`, {
        headers: { 'user-agent': USER_AGENT },
      });
      if (!res.ok) throw new GithubError(res.status, `refs_${res.status}`);
      if (!(res.headers.get('content-type') ?? '').startsWith(ADVERTISEMENT))
        throw new GithubError(res.status, 'refs_not_git');
      return parseRefs((await readCapped(res, MAX_REFS_BYTES)).toString('latin1'));
    },

    api: async <T>(apiPath: string, schema: z.ZodType<T>, opts: ApiOptions<T> = {}): Promise<T | null> => {
      const url = `${options.api}${apiPath}`;
      const stored = cache.entries[url];
      const known = stored ? schema.safeParse(stored.body) : null;
      const remembered = known?.success ? known : null;
      if (opts.settled && remembered) return remembered.data;
      const until = limitedUntil();
      if (until !== null) throw new GithubLimited(until);
      const res = await send(url, remembered ? (stored?.etag ?? null) : null);
      const brake = await brakeOf(res);
      if (brake !== null) throw limit(brake);
      // Das war die letzte Frage dieser Stunde: bis zum Zurücksetzen nicht mehr fragen.
      const reset = Number(res.headers.get('x-ratelimit-reset') ?? Number.NaN);
      if (res.headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset))
        limit(reset * SECOND_MS);
      if (res.status === HTTP_NOT_MODIFIED && remembered && stored) {
        cache.entries[url] = { ...stored, at: now() };
        save();
        return remembered.data;
      }
      if (res.status === HTTP_NOT_FOUND) return null;
      if (!res.ok) throw new GithubError(res.status, `github_${res.status}`);
      const parsed = schema.safeParse(await res.json().catch(() => undefined));
      if (!parsed.success) throw new GithubError(res.status, 'github_unexpected');
      const value = opts.keep ? opts.keep(parsed.data) : parsed.data;
      cache.entries[url] = { etag: res.headers.get('etag'), at: now(), body: value };
      save();
      return value;
    },

    limitedUntil,
    key: () => keyState.value,
  };
}
