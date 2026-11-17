import crypto from 'node:crypto';

/**
 * Nachgebautes GitHub für die Tests – mit den Regeln des echten:
 * - Git (Smart HTTP): `<repo>.git/info/refs?service=git-upload-pack` liefert die Refs als pkt-lines (ohne Grenze).
 * - API: ETag an jeder Antwort, `If-None-Match` mit gleichem ETag → 304; Grenze pro Stunde mit `x-ratelimit-*`;
 *   gebremst → 403 mit `x-ratelimit-remaining: 0` und `x-ratelimit-reset` (Sekunden seit 1970).
 * - Releases: `github.com/<repo>/releases/download/<tag>/<datei>` → 302 auf release-assets → die Bytes.
 * - Ein Schlüssel, den GitHub nicht kennt → 401 („Bad credentials“), auch für öffentliche Repos.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const HTTP_OK = 200;
const HTTP_FOUND = 302;
const HTTP_NOT_MODIFIED = 304;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY = 429;
const PKT_HEADER = 4;
const HEX = 16;
const LINE_END = 1;
const LIMIT = 60;
const CAPABILITIES = 'multi_ack thin-pack side-band side-band-64k ofs-delta shallow agent=git/github-test';

const API = 'https://api.github.com';
const WEB = 'https://github.com';
const ASSETS = 'https://release-assets.githubusercontent.com';

/** Eine Zeile als pkt-line: vier Hex-Ziffern Länge (mit sich selbst und dem Zeilenende), dann der Inhalt. */
const pkt = (line: string): string =>
  `${(Buffer.byteLength(line) + PKT_HEADER + LINE_END).toString(HEX).padStart(PKT_HEADER, '0')}${line}\n`;

/** Antwort wie von GitHub auf `info/refs?service=git-upload-pack`. */
export function advertisement(refs: ReadonlyMap<string, string>): string {
  const [first, ...rest] = [...refs];
  const lines = first
    ? [`${first[1]} ${first[0]}\0${CAPABILITIES}`, ...rest.map(([n, sha]) => `${sha} ${n}`)]
    : [];
  return `${pkt('# service=git-upload-pack')}0000${lines.map(pkt).join('')}0000`;
}

export const sha = (seed: string): string => crypto.createHash('sha1').update(seed).digest('hex');

export interface FakeGithub {
  readonly fetch: FetchLike;
  /** Refs je Repo („pmornhart/moinmorni.net“ → „refs/heads/main“ → Commit). */
  readonly refs: Map<string, Map<string, string>>;
  /** API-Antworten je Pfad ab /repos/… (ohne Abfrage, außer sie gehört dazu). */
  readonly api: Map<string, unknown>;
  /** Release-Dateien: „<repo>/<tag>/<datei>“ → Bytes. */
  readonly assets: Map<string, Buffer>;
  /** Alle Adressen, in der Reihenfolge der Anfragen. */
  readonly calls: string[];
  /** Nur die API-Anfragen samt Kopfzeilen, die zählen. */
  readonly apiCalls: Array<{
    readonly url: string;
    readonly auth: string | null;
    readonly ifNoneMatch: string | null;
  }>;
  /** Kopfzeilen der Git-Anfragen (darf nie einen Schlüssel tragen). */
  readonly gitAuth: Array<string | null>;
  /** So viele API-Fragen sind in dieser Stunde noch frei. */
  remaining: number;
  /** Wann die Stunde neu beginnt (Sekunden seit 1970). */
  reset: number;
  /** Nebenbei-Grenze: 429 mit Retry-After (Sekunden). */
  retryAfter: number | null;
  /** Keine Verbindung zu GitHub (weder Git noch API). */
  offline: boolean;
  /** Ein Schlüssel, den GitHub nicht (mehr) kennt. */
  badToken: string | null;
}

export function createFakeGithub(): FakeGithub {
  const etagOf = (body: string): string => `"${crypto.createHash('sha256').update(body).digest('hex')}"`;
  const headerOf = (init: RequestInit | undefined, name: string): string | null =>
    new Headers(init?.headers).get(name);

  const fake: FakeGithub = {
    refs: new Map(),
    api: new Map(),
    assets: new Map(),
    calls: [],
    apiCalls: [],
    gitAuth: [],
    remaining: LIMIT,
    reset: 0,
    retryAfter: null,
    offline: false,
    badToken: null,
    fetch: async (input, init) => {
      fake.calls.push(input);
      if (fake.offline) throw new TypeError('fetch failed');
      const url = new URL(input);
      if (input.startsWith(`${WEB}/`) && url.pathname.endsWith('.git/info/refs')) {
        fake.gitAuth.push(headerOf(init, 'authorization'));
        const repo = url.pathname.slice(1, -'.git/info/refs'.length);
        const refs = fake.refs.get(repo);
        if (!refs || url.searchParams.get('service') !== 'git-upload-pack')
          return new Response('Repository not found.', { status: HTTP_UNAUTHORIZED });
        return new Response(advertisement(refs), {
          status: HTTP_OK,
          headers: { 'content-type': 'application/x-git-upload-pack-advertisement' },
        });
      }
      if (input.startsWith(`${WEB}/`) && url.pathname.includes('/releases/download/')) {
        const key = url.pathname.slice(1).replace('/releases/download/', '/');
        if (!fake.assets.has(key)) return new Response('Not Found', { status: HTTP_NOT_FOUND });
        return new Response(null, {
          status: HTTP_FOUND,
          headers: { location: `${ASSETS}/${encodeURIComponent(key)}?sig=x` },
        });
      }
      if (input.startsWith(`${ASSETS}/`)) {
        const bytes = fake.assets.get(decodeURIComponent(url.pathname.slice(1)));
        return bytes
          ? new Response(bytes, { status: HTTP_OK })
          : new Response('', { status: HTTP_NOT_FOUND });
      }
      if (input.startsWith(`${API}/`)) {
        const auth = headerOf(init, 'authorization');
        const ifNoneMatch = headerOf(init, 'if-none-match');
        fake.apiCalls.push({ url: input, auth, ifNoneMatch });
        if (auth && fake.badToken && auth === `Bearer ${fake.badToken}`)
          return Response.json({ message: 'Bad credentials' }, { status: HTTP_UNAUTHORIZED });
        if (fake.retryAfter !== null)
          return Response.json(
            { message: 'You have exceeded a secondary rate limit.' },
            { status: HTTP_TOO_MANY, headers: { 'retry-after': String(fake.retryAfter) } },
          );
        const limits = { 'x-ratelimit-limit': String(LIMIT), 'x-ratelimit-reset': String(fake.reset) };
        if (fake.remaining <= 0)
          return Response.json(
            { message: 'API rate limit exceeded for 203.0.113.25. (But here’s the good news: …)' },
            { status: HTTP_FORBIDDEN, headers: { ...limits, 'x-ratelimit-remaining': '0' } },
          );
        const body = fake.api.get(url.pathname.slice('/repos/'.length) + url.search);
        const text = body === undefined ? null : JSON.stringify(body);
        const etag = text === null ? null : etagOf(text);
        // Wie bei GitHub: eine 304 zählt nur mit Schlüssel nicht mit.
        const free = auth !== null && etag !== null && ifNoneMatch === etag;
        if (!free) fake.remaining -= 1;
        const headers = { ...limits, 'x-ratelimit-remaining': String(fake.remaining) };
        if (text === null || etag === null)
          return Response.json({ message: 'Not Found' }, { status: HTTP_NOT_FOUND, headers });
        if (ifNoneMatch === etag)
          return new Response(null, { status: HTTP_NOT_MODIFIED, headers: { ...headers, etag } });
        return new Response(text, {
          status: HTTP_OK,
          headers: { ...headers, etag, 'content-type': 'application/json' },
        });
      }
      return new Response('unbekannt', { status: HTTP_NOT_FOUND });
    },
  };
  return fake;
}

/** Ein Commit in der Form, in der die API ihn liefert. */
/** Ein Commit wie in GitHubs Vergleich; `parents` (erst der Branch, dann was ein Merge hereinholt) wie dort. */
export const apiCommit = (
  commitSha: string,
  message: string,
  date: string | null = null,
  parents?: readonly string[],
): unknown => ({
  sha: commitSha,
  commit: { message, committer: date ? { date } : null },
  ...(parents ? { parents: parents.map((p) => ({ sha: p })) } : {}),
});
