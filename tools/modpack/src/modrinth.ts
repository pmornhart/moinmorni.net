/**
 * Modrinth-API v2 (https://docs.modrinth.com/api/) – nur Lesen, ohne Schlüssel – und das Zusammenstellen der Mods:
 * pro Mod die passende Version suchen, Pflicht-Abhängigkeiten nachholen, Verbotenes und Unverträgliches erkennen.
 */
import { FORBIDDEN, type ModSpec } from './mods.js';

export const MODRINTH_API = 'https://api.modrinth.com/v2';

export type VersionType = 'release' | 'beta' | 'alpha';
export type DependencyType = 'required' | 'optional' | 'incompatible' | 'embedded';
export type Side = 'required' | 'optional' | 'unsupported' | 'unknown';

export interface ModrinthDependency {
  readonly project_id: string | null;
  readonly version_id: string | null;
  readonly dependency_type: DependencyType;
}

export interface ModrinthFile {
  readonly url: string;
  readonly filename: string;
  readonly primary: boolean;
  readonly size: number;
  readonly hashes: { readonly sha1: string; readonly sha512: string };
}

export interface ModrinthVersion {
  readonly id: string;
  readonly project_id: string;
  readonly version_number: string;
  readonly version_type: VersionType;
  readonly date_published: string;
  readonly game_versions: readonly string[];
  readonly loaders: readonly string[];
  readonly dependencies: readonly ModrinthDependency[];
  readonly files: readonly ModrinthFile[];
}

export interface ModrinthProject {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly license: { readonly id: string; readonly name: string; readonly url: string | null };
  readonly client_side: Side;
  readonly server_side: Side;
}

/** Für welche Minecraft-Version und welchen Lader gesucht wird. */
export interface Target {
  readonly gameVersion: string;
  readonly loader: string;
}

/** Was das Zusammenstellen von Modrinth braucht – im Test durch eine Attrappe ersetzt. */
export interface ModrinthReader {
  versions(project: string, target: Target): Promise<readonly ModrinthVersion[]>;
  version(id: string): Promise<ModrinthVersion>;
  projects(ids: readonly string[]): Promise<readonly ModrinthProject[]>;
}

const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY = 429;
const HTTP_SERVER_ERROR = 500;
const MAX_ATTEMPTS = 3;
const RETRY_PAUSE_MS = 2_000;
const MS_PER_SECOND = 1_000;
const PROJECTS_PER_REQUEST = 100;

function pause(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/** Wartezeit, die Modrinth bei zu vielen Anfragen nennt (Sekunden bis zum Zurücksetzen), sonst eine kurze Pause. */
function retryPause(response: Response): number {
  const reset = Number(response.headers.get('x-ratelimit-reset') ?? Number.NaN);
  return Number.isFinite(reset) && reset > 0 ? reset * MS_PER_SECOND : RETRY_PAUSE_MS;
}

export class ModrinthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ModrinthError';
  }
}

async function getJson(url: string, userAgent: string, attempt = 1): Promise<unknown> {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
  const retry = response.status === HTTP_TOO_MANY || response.status >= HTTP_SERVER_ERROR;
  if (retry && attempt < MAX_ATTEMPTS) {
    await pause(retryPause(response));
    return getJson(url, userAgent, attempt + 1);
  }
  if (!response.ok) throw new ModrinthError(`${url} antwortet mit ${response.status}`, response.status);
  return response.json();
}

/** Echte Modrinth-API. `userAgent` nennt das Projekt (Modrinth bittet darum). */
export function modrinthApi(userAgent: string, base = MODRINTH_API): ModrinthReader {
  return {
    async versions(project, target) {
      const query = new URLSearchParams({
        loaders: JSON.stringify([target.loader]),
        game_versions: JSON.stringify([target.gameVersion]),
      });
      try {
        return (await getJson(
          `${base}/project/${encodeURIComponent(project)}/version?${query}`,
          userAgent,
        )) as ModrinthVersion[];
      } catch (error) {
        if (error instanceof ModrinthError && error.status === HTTP_NOT_FOUND) {
          throw new Error(`Modrinth kennt kein Projekt „${project}“ – Slug in src/mods.ts prüfen`, {
            cause: error,
          });
        }
        throw error;
      }
    },
    async version(id) {
      return (await getJson(`${base}/version/${encodeURIComponent(id)}`, userAgent)) as ModrinthVersion;
    },
    async projects(ids) {
      const chunks = Array.from({ length: Math.ceil(ids.length / PROJECTS_PER_REQUEST) }, (_, i) =>
        ids.slice(i * PROJECTS_PER_REQUEST, (i + 1) * PROJECTS_PER_REQUEST),
      );
      const pages = await Promise.all(
        chunks.map(
          async (chunk) =>
            (await getJson(
              `${base}/projects?${new URLSearchParams({ ids: JSON.stringify(chunk) })}`,
              userAgent,
            )) as ModrinthProject[],
        ),
      );
      return pages.flat();
    },
  };
}

/** Stabile Versionen zuerst, dann Beta, dann Alpha. */
const STABILITY: readonly VersionType[] = ['release', 'beta', 'alpha'];

function fits(version: ModrinthVersion, target: Target): boolean {
  return version.loaders.includes(target.loader) && version.game_versions.includes(target.gameVersion);
}

/** Neueste passende Version – eine stabile, wenn es eine gibt (auch wenn eine Beta neuer ist). */
export function bestVersion(
  versions: readonly ModrinthVersion[],
  target: Target,
): ModrinthVersion | undefined {
  const rank = (v: ModrinthVersion): number => STABILITY.indexOf(v.version_type);
  return versions
    .filter((v) => fits(v, target) && primaryFile(v) !== undefined)
    .toSorted((a, b) => rank(a) - rank(b) || Date.parse(b.date_published) - Date.parse(a.date_published))[0];
}

/** Die eigentliche Mod-Datei einer Version (nicht die Quelltext-Jar daneben). */
export function primaryFile(version: ModrinthVersion): ModrinthFile | undefined {
  const jars = version.files.filter((f) => f.filename.endsWith('.jar'));
  return jars.find((f) => f.primary) ?? jars[0];
}

/** Gewählte Version eines Projekts. `pinnedBy`: Projekt, das genau diese Version verlangt. */
export interface Chosen {
  readonly version: ModrinthVersion;
  readonly spec: ModSpec | undefined;
  readonly pinnedBy: string | undefined;
}

export type ResolveEvent =
  | { readonly kind: 'skipped'; readonly project: string; readonly by: string }
  | {
      readonly kind: 'pinned';
      readonly project: string;
      readonly by: string;
      readonly from: string;
      readonly to: string;
    }
  | { readonly kind: 'pin-ignored'; readonly project: string; readonly by: string; readonly reason: string };

export interface Resolution {
  /** Schlüssel: Projekt-ID bei Modrinth. */
  readonly chosen: ReadonlyMap<string, Chosen>;
  /** Mods aus der Liste ohne passende Version. */
  readonly missing: readonly ModSpec[];
  readonly events: readonly ResolveEvent[];
}

interface Wanted {
  readonly project: string;
  readonly versionId: string | null;
  readonly by: string;
}

function required(version: ModrinthVersion): ModrinthDependency[] {
  return version.dependencies.filter((d) => d.dependency_type === 'required' && d.project_id !== null);
}

/** Pflicht-Abhängigkeiten, die noch fehlen – oder eine genau verlangte Version, die (noch) nicht gewählt ist. */
function openDependencies(resolution: Resolution, skipped: ReadonlySet<string>): Wanted[] {
  const all = [...resolution.chosen.entries()].flatMap(([by, chosen]) =>
    required(chosen.version).map((d) => ({ project: d.project_id ?? '', versionId: d.version_id, by })),
  );
  const open = all.filter((want) => {
    if (skipped.has(want.project)) return false;
    const have = resolution.chosen.get(want.project);
    if (have === undefined) return true;
    return want.versionId !== null && have.version.id !== want.versionId && have.pinnedBy === undefined;
  });
  return open.filter((want, i) => open.findIndex((other) => other.project === want.project) === i);
}

interface Found {
  readonly want: Wanted;
  readonly version: ModrinthVersion | undefined;
  /** Die genau verlangte Version passt und wurde genommen. */
  readonly pinned: boolean;
}

async function findDependency(api: ModrinthReader, target: Target, want: Wanted): Promise<Found> {
  if (want.versionId !== null) {
    const pinned = await api.version(want.versionId);
    if (fits(pinned, target) && primaryFile(pinned) !== undefined)
      return { want, version: pinned, pinned: true };
  }
  const version = bestVersion(await api.versions(want.project, target), target);
  return { want, version, pinned: false };
}

interface Step {
  readonly resolution: Resolution;
  readonly skipped: ReadonlySet<string>;
}

function applyFound(step: Step, found: Found): Step {
  const { resolution, skipped } = step;
  const project = found.want.project;
  const have = resolution.chosen.get(project);
  if (have && !found.pinned) {
    const event: ResolveEvent = {
      kind: 'pin-ignored',
      project,
      by: found.want.by,
      reason: 'die verlangte Version passt nicht zu Fabric/Minecraft',
    };
    return {
      resolution: {
        ...resolution,
        chosen: new Map([...resolution.chosen, [project, { ...have, pinnedBy: found.want.by }]]),
        events: [...resolution.events, event],
      },
      skipped,
    };
  }
  if (found.version === undefined) {
    const event: ResolveEvent = { kind: 'skipped', project, by: found.want.by };
    return {
      resolution: { ...resolution, events: [...resolution.events, event] },
      skipped: new Set([...skipped, project]),
    };
  }
  const events: ResolveEvent[] = have
    ? [
        {
          kind: 'pinned',
          project,
          by: found.want.by,
          from: have.version.version_number,
          to: found.version.version_number,
        },
      ]
    : [];
  const chosen: Chosen = {
    version: found.version,
    spec: have?.spec,
    pinnedBy: found.pinned ? found.want.by : undefined,
  };
  return {
    resolution: {
      ...resolution,
      chosen: new Map([...resolution.chosen, [project, chosen]]),
      events: [...resolution.events, ...events],
    },
    skipped,
  };
}

async function closeDependencies(api: ModrinthReader, target: Target, step: Step): Promise<Resolution> {
  const open = openDependencies(step.resolution, step.skipped);
  if (open.length === 0) return step.resolution;
  const found = await Promise.all(open.map((want) => findDependency(api, target, want)));
  return closeDependencies(api, target, found.reduce(applyFound, step));
}

/** Sucht zu jeder Mod der Liste die passende Version und holt alle Pflicht-Abhängigkeiten dazu. */
export async function resolveMods(
  api: ModrinthReader,
  mods: readonly ModSpec[],
  target: Target,
): Promise<Resolution> {
  const listed = await Promise.all(
    mods.map(async (spec) => ({ spec, version: bestVersion(await api.versions(spec.slug, target), target) })),
  );
  const chosen = new Map(
    listed.flatMap(({ spec, version }) =>
      version ? [[version.project_id, { version, spec, pinnedBy: undefined } satisfies Chosen] as const] : [],
    ),
  );
  const missing = listed.filter(({ version }) => version === undefined).map(({ spec }) => spec);
  return closeDependencies(api, target, { resolution: { chosen, missing, events: [] }, skipped: new Set() });
}

export interface Problem {
  readonly project: string;
  readonly text: string;
}

/** Was das Pack nicht enthalten darf: verbotene Mods (Minimap, Axiom) und Mods, die sich gegenseitig ausschließen. */
export function problems(
  chosen: ReadonlyMap<string, Chosen>,
  projects: ReadonlyMap<string, ModrinthProject>,
): Problem[] {
  const forbidden = [...chosen.keys()].flatMap((id) => {
    const slug = projects.get(id)?.slug ?? id;
    const rule = FORBIDDEN.find((f) => f.slug === slug);
    return rule ? [{ project: id, text: `${slug} darf nicht ins Pack (${rule.reason})` }] : [];
  });
  const clashes = [...chosen.entries()].flatMap(([id, c]) =>
    c.version.dependencies
      .filter(
        (d) => d.dependency_type === 'incompatible' && d.project_id !== null && chosen.has(d.project_id),
      )
      .map((d) => ({
        project: id,
        text: `${projects.get(id)?.title ?? id} verträgt sich nicht mit ${projects.get(d.project_id ?? '')?.title ?? d.project_id}`,
      })),
  );
  return [...forbidden, ...clashes];
}

/** Wer braucht diese Mod? (Projekt-IDs der Mods, die sie als Pflicht nennen) */
export function neededBy(chosen: ReadonlyMap<string, Chosen>, project: string): string[] {
  return [...chosen.entries()]
    .filter(([, c]) => required(c.version).some((d) => d.project_id === project))
    .map(([id]) => id);
}
