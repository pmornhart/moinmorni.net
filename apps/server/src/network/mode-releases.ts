import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import type { FetchLike, GithubClient } from '../lib/github.js';

/**
 * Plugins der Spielmodi: Jeder Modus hat ein eigenes Repo (z. B. pmornhart/MoinMorni-Duels). Dort baut GitHub bei
 * jedem Stand auf `main` ein Release mit der Jar (Tag `v<Version>`). MoinMorni schaut alle 10 Minuten nach – ganz
 * ohne die API von GitHub und ihre Grenze (`lib/github.ts`): Welche Tags es gibt, sagt Git selbst; die Jar des
 * höchsten Tags kommt direkt von der Release-Seite (`github.com/<Repo>/releases/download/<Tag>/<Jar>`, Namen in
 * `MODE_JARS`). Nur wenn die Jar dort unter dem erwarteten Namen fehlt, fragt MoinMorni einmal die API, wie sie heißt.
 * Was es gefunden hat, merkt es sich auf der Platte (`<Daten>/github/releases.json`), auch über einen Neustart.
 *
 * Zum Ausprobieren ohne Release: Liegt im Ordner `localDir` eine Jar mit dem Namen des Repos (`MoinMorni-Duels.jar`),
 * nimmt MoinMorni diese.
 */

export interface ModeRelease {
  readonly repo: string;
  /** z. B. "v1.0.0" oder "local-<Größe>-<Zeit>" */
  readonly tag: string;
  readonly fileName: string;
  readonly bytes: Buffer;
}

export interface ReleaseSource {
  /** Neuestes Release eines Repos; `jar` = Name der Jar darin (ohne: wie das Repo, z. B. „Morni-Party.jar“). */
  readonly latest: (repo: string, jar?: string) => Promise<ModeRelease | null>;
}

const MINUTE_MS = 60_000;
const CHECK_MINUTES = 10;
/** So oft schaut MoinMorni höchstens nach (Git fragen kostet nichts von der API-Grenze). */
export const RELEASE_CHECK_MS = CHECK_MINUTES * MINUTE_MS;
/** Gemerkt etwas kürzer als der Takt – sonst träfe ein Nachsehen nach genau 10 Minuten manchmal noch den alten Stand. */
const CACHE_MS = RELEASE_CHECK_MS - MINUTE_MS;
const API_RETRY_MINUTES = 60;
/** Fehlt die Jar unter dem erwarteten Namen: die API höchstens einmal pro Stunde und Tag fragen. */
const API_RETRY_MS = API_RETRY_MINUTES * MINUTE_MS;
/** Größte erlaubte Jar (64 MB). */
const MAX_BYTES = 67_108_864;
/** Downloads nur von GitHub (auch nach Weiterleitungen). */
const ALLOWED_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);
const REDIRECTS = 5;
const HTTP_OK = 200;
const HTTP_REDIRECT_MIN = 300;
const HTTP_REDIRECT_MAX = 399;
const HTTP_NOT_FOUND = 404;
const TAG_PREFIX = 'refs/tags/';
const PEELED = '^{}';
const JAR = '.jar';

// Repo-Namen wie "pmornhart/MoinMorni-Duels".
// https://regex101.com/?flavor=javascript&regex=%5E%5BA-Za-z0-9-%5D%2B%2F%5BA-Za-z0-9._-%5D%2B%24&testString=pmornhart%2FMoinMorni-Duels
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
// Versions-Tag wie "v0.1.2" (auch ohne "v"): Zahlen für den Vergleich; "nightly" passt nicht.
// https://regex101.com/?flavor=javascript&regex=%5Ev%3F(%5Cd%2B)%5C.(%5Cd%2B)%5C.(%5Cd%2B)%24&testString=v0.1.2
const VERSION_TAG = /^v?(\d+)\.(\d+)\.(\d+)$/;
// Name einer Jar oder eines Tags in der Download-Adresse: "Morni-Party.jar", "v0.2.1"; nicht "../x" oder "a b".
// https://regex101.com/?flavor=javascript&regex=%5E%5BA-Za-z0-9_%5D%5BA-Za-z0-9._%2B-%5D*%24&testString=Morni-Party.jar
const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._+-]*$/;

const releaseSchema = z.object({
  tag_name: z.string(),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.string() })),
});
type GithubRelease = z.infer<typeof releaseSchema>;

const knownSchema = z.object({ tag: z.string(), fileName: z.string(), url: z.string() });
type KnownRelease = z.infer<typeof knownSchema>;
const knownFileSchema = z.record(z.string(), knownSchema);

/** Das Release der API kürzer: Tag, Name und Adresse der Jar – null ohne Jar. */
const jarOf = (release: GithubRelease | null): KnownRelease | null => {
  const asset = release?.assets.find((a) => a.name.endsWith(JAR));
  return release && asset
    ? { tag: release.tag_name, fileName: asset.name, url: asset.browser_download_url }
    : null;
};

/** Tag-Namen aus der Liste von Git („v0.1.0“), ohne die Zeilen „^{}“ für annotierte Tags. */
export function tagsOf(refs: ReadonlyMap<string, string>): string[] {
  return [...refs.keys()]
    .filter((name) => name.startsWith(TAG_PREFIX) && !name.endsWith(PEELED))
    .map((name) => name.slice(TAG_PREFIX.length));
}

/** Höchster Versions-Tag („v0.10.0“ vor „v0.9.0“ – nach Zahlen, nicht nach Buchstaben), null ohne Versions-Tags. */
export function newestVersionTag(tags: readonly string[]): string | null {
  const versions = tags.flatMap((name) => {
    const m = VERSION_TAG.exec(name);
    return m ? [{ name, parts: [Number(m[1]), Number(m[2]), Number(m[3])] }] : [];
  });
  const later = (a: readonly number[], b: readonly number[]): boolean => {
    const i = a.findIndex((n, k) => n !== b[k]);
    return i >= 0 && (a[i] ?? 0) > (b[i] ?? 0);
  };
  const best = versions.reduce<{ name: string; parts: number[] } | null>(
    (top, v) => (top === null || later(v.parts, top.parts) ? v : top),
    null,
  );
  return best?.name ?? null;
}

async function fetchFollowing(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  hops = REDIRECTS,
): Promise<Response> {
  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.has(host) || !url.startsWith('https://')) throw new Error(`host_not_allowed:${host}`);
  const res = await fetchImpl(url, { ...init, redirect: 'manual' });
  if (res.status >= HTTP_REDIRECT_MIN && res.status <= HTTP_REDIRECT_MAX) {
    const next = res.headers.get('location');
    if (!next || hops <= 0) throw new Error('too_many_redirects');
    return fetchFollowing(fetchImpl, new URL(next, url).toString(), init, hops - 1);
  }
  return res;
}

export interface ReleaseOptions {
  /** Jars zum Ausprobieren ohne Release: `<Ordner>/<Repo-Name>.jar`. */
  readonly localDir?: string;
  /** Was über die Releases bekannt ist (übersteht einen Neustart). */
  readonly stateFile?: string;
  /** GitHub selbst (Release-Seiten), sonst https://github.com. */
  readonly web?: string;
  /** Tests: eigener Weg für die Downloads. */
  readonly fetchImpl?: FetchLike;
  readonly now?: () => number;
}

export function githubReleases(
  log: FastifyBaseLogger,
  github: GithubClient,
  options: ReleaseOptions = {},
): ReleaseSource {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const web = options.web ?? 'https://github.com';
  const cache = new Map<string, { at: number; release: ModeRelease | null }>();
  /** Wann die API zuletzt nach einem Tag gefragt wurde („Repo@Tag“). */
  const askedApi = new Map<string, number>();
  const known: Record<string, KnownRelease> = ((): Record<string, KnownRelease> => {
    try {
      return options.stateFile
        ? knownFileSchema.parse(JSON.parse(fs.readFileSync(options.stateFile, 'utf8')))
        : {};
    } catch {
      return {};
    }
  })();
  const remember = (repo: string, release: KnownRelease): void => {
    known[repo] = release;
    if (!options.stateFile) return;
    try {
      fs.mkdirSync(path.dirname(options.stateFile), { recursive: true });
      const tmp = `${options.stateFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(known)}\n`);
      fs.renameSync(tmp, options.stateFile);
    } catch {
      // Nicht schreibbar: dann schaut MoinMorni nach dem nächsten Neustart eben noch einmal.
    }
  };

  const fromLocal = (repo: string): ModeRelease | null => {
    if (!options.localDir) return null;
    const fileName = `${repo.split('/')[1] ?? repo}${JAR}`;
    const file = path.join(options.localDir, fileName);
    if (!fs.existsSync(file)) return null;
    const stat = fs.statSync(file);
    return {
      repo,
      tag: `local-${stat.size}-${Math.round(stat.mtimeMs)}`,
      fileName,
      bytes: fs.readFileSync(file),
    };
  };

  /** Die Jar eines Releases: die schon geladene, wenn es dasselbe ist – sonst von GitHub. null = gibt es dort nicht. */
  const download = async (repo: string, release: KnownRelease): Promise<ModeRelease | null> => {
    const before = cache.get(repo)?.release;
    if (before && before.tag === release.tag && before.fileName === release.fileName) return before;
    const res = await fetchFollowing(fetchImpl, release.url, { headers: { 'user-agent': 'MoinMorni' } });
    if (res.status === HTTP_NOT_FOUND) return null;
    if (res.status !== HTTP_OK) throw new Error(`download_${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new Error('too_big');
    return { repo, tag: release.tag, fileName: release.fileName, bytes };
  };

  /** Fehlt die Jar unter dem erwarteten Namen: die API fragen, wie sie heißt (höchstens einmal pro Stunde). */
  const askApi = async (repo: string, tag: string | null): Promise<KnownRelease | null> => {
    const key = `${repo}@${tag ?? 'latest'}`;
    const asked = askedApi.get(key);
    if (asked !== undefined && now() - asked < API_RETRY_MS) return null;
    askedApi.set(key, now());
    const apiPath = tag ? `/repos/${repo}/releases/tags/${tag}` : `/repos/${repo}/releases/latest`;
    return jarOf(await github.api(apiPath, releaseSchema));
  };

  /** Neuestes Release: höchster Versions-Tag laut Git, Jar direkt von der Release-Seite. */
  const newest = async (repo: string, jarName: string): Promise<ModeRelease | null> => {
    const tag = newestVersionTag(tagsOf(await github.refs(repo)));
    const seen = known[repo];
    if (tag !== null && seen?.tag === tag) return download(repo, seen);
    const direct =
      tag !== null && SAFE_NAME.test(tag) && SAFE_NAME.test(jarName)
        ? { tag, fileName: jarName, url: `${web}/${repo}/releases/download/${tag}/${jarName}` }
        : null;
    const got = direct ? await download(repo, direct) : null;
    if (direct && got) {
      remember(repo, direct);
      return got;
    }
    // Andere Datei, andere Art Tag – oder das Release wird gerade noch gebaut.
    const viaApi = await askApi(repo, tag);
    const found = viaApi ? await download(repo, viaApi) : null;
    if (viaApi && found) {
      remember(repo, viaApi);
      return found;
    }
    return seen ? download(repo, seen) : null;
  };

  return {
    latest: async (repo, jar) => {
      if (!REPO.test(repo)) return null;
      const local = fromLocal(repo);
      if (local) return local;
      const hit = cache.get(repo);
      if (hit && now() - hit.at < CACHE_MS) return hit.release;
      try {
        const release = await newest(repo, jar ?? `${repo.split('/')[1] ?? repo}${JAR}`);
        cache.set(repo, { at: now(), release });
        return release;
      } catch (err) {
        log.warn({ err, repo }, 'Spielmodus: Release ließ sich nicht holen – nächster Versuch später');
        // Was zuletzt da war, gilt weiter (nach einem Neustart: das gemerkte Release).
        const fallback = known[repo];
        if (hit?.release || !fallback) return hit?.release ?? null;
        try {
          return await download(repo, fallback);
        } catch {
          return null;
        }
      }
    },
  };
}
