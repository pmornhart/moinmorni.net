import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Plugins der Spielmodi: Jeder Modus hat ein eigenes Repo (z. B. pmornhart/Morni-Duels). Dort baut GitHub bei
 * jedem Stand auf `main` ein Release mit der Jar. morni.net holt das neueste Release (öffentlich, ohne Schlüssel),
 * höchstens einmal pro Stunde, und spielt es auf den Server des Modus.
 *
 * Zum Ausprobieren ohne Release: Liegt im Ordner `localDir` eine Jar mit dem Namen des Repos (`Morni-Duels.jar`),
 * nimmt morni.net diese.
 */

export interface ModeRelease {
  readonly repo: string;
  /** z. B. "v1.0.0" oder "local-<Größe>-<Zeit>" */
  readonly tag: string;
  readonly fileName: string;
  readonly bytes: Buffer;
}

export interface ReleaseSource {
  readonly latest: (repo: string) => Promise<ModeRelease | null>;
}

const HOUR_MS = 3_600_000;
/** Größte erlaubte Jar (64 MB). */
const MAX_BYTES = 67_108_864;
const GITHUB_API = 'https://api.github.com';
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

// Repo-Namen wie "pmornhart/Morni-Duels".
// https://regex101.com/?flavor=javascript&regex=%5E%5BA-Za-z0-9-%5D%2B%2F%5BA-Za-z0-9._-%5D%2B%24&testString=pmornhart%2FMorni-Duels
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

interface GithubRelease {
  readonly tag_name: string;
  readonly assets: ReadonlyArray<{ readonly name: string; readonly browser_download_url: string }>;
}

async function fetchFollowing(url: string, init: RequestInit, hops = REDIRECTS): Promise<Response> {
  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.has(host) || !url.startsWith('https://')) throw new Error(`host_not_allowed:${host}`);
  const res = await fetch(url, { ...init, redirect: 'manual' });
  if (res.status >= HTTP_REDIRECT_MIN && res.status <= HTTP_REDIRECT_MAX) {
    const next = res.headers.get('location');
    if (!next || hops <= 0) throw new Error('too_many_redirects');
    return fetchFollowing(new URL(next, url).toString(), init, hops - 1);
  }
  return res;
}

export function githubReleases(log: FastifyBaseLogger, localDir?: string): ReleaseSource {
  const cache = new Map<string, { at: number; release: ModeRelease | null }>();
  const fromLocal = (repo: string): ModeRelease | null => {
    if (!localDir) return null;
    const fileName = `${repo.split('/')[1] ?? repo}.jar`;
    const file = path.join(localDir, fileName);
    if (!fs.existsSync(file)) return null;
    const stat = fs.statSync(file);
    return {
      repo,
      tag: `local-${stat.size}-${Math.round(stat.mtimeMs)}`,
      fileName,
      bytes: fs.readFileSync(file),
    };
  };
  const fromGithub = async (repo: string): Promise<ModeRelease | null> => {
    const headers = { accept: 'application/vnd.github+json', 'user-agent': 'morni.net' };
    const res = await fetchFollowing(`${GITHUB_API}/repos/${repo}/releases/latest`, { headers });
    if (res.status === HTTP_NOT_FOUND) return null;
    if (res.status !== HTTP_OK) throw new Error(`github_${res.status}`);
    const release = (await res.json()) as GithubRelease;
    const asset = release.assets.find((a) => a.name.endsWith('.jar'));
    if (!asset) return null;
    const download = await fetchFollowing(asset.browser_download_url, {
      headers: { 'user-agent': 'morni.net' },
    });
    if (download.status !== HTTP_OK) throw new Error(`download_${download.status}`);
    const bytes = Buffer.from(await download.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new Error('too_big');
    return { repo, tag: release.tag_name, fileName: asset.name, bytes };
  };
  return {
    latest: async (repo) => {
      if (!REPO.test(repo)) return null;
      const local = fromLocal(repo);
      if (local) return local;
      const hit = cache.get(repo);
      if (hit && Date.now() - hit.at < HOUR_MS) return hit.release;
      try {
        const release = await fromGithub(repo);
        cache.set(repo, { at: Date.now(), release });
        return release;
      } catch (err) {
        log.warn({ err, repo }, 'Spielmodus: Release ließ sich nicht holen – nächster Versuch später');
        return hit?.release ?? null;
      }
    },
  };
}
