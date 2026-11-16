/**
 * Lädt die zuletzt gebaute Packung (`dist/release.json`) als neue Version eines vorhandenen Modrinth-Projekts hoch
 * (API `POST /v2/version`, https://docs.modrinth.com/api/operations/createversion/).
 *
 * Der Schlüssel kommt nur aus der Umgebung, nie aus einer Datei im Repo:
 *   MODRINTH_TOKEN=mrp_… pnpm --filter @moinmorni/modpack publish:modrinth
 * Weitere Angaben (alle freiwillig):
 *   MODRINTH_PROJECT  Slug oder ID des Projekts (Standard: moinmorni)
 *   --type beta       Version als Beta (Standard: release); auch alpha
 *   --trocken         nichts hochladen, nur zeigen, was geschickt würde (geht ohne Schlüssel)
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DIST_DIR, readRelease, run, startedDirectly, userAgent, type ReleaseInfo } from './common.js';
import { MODRINTH_API, type VersionType } from './modrinth.js';

const DEFAULT_PROJECT = 'moinmorni';
const MRPACK_TYPE = 'application/x-modrinth-modpack+zip';
const VERSION_TYPES: readonly VersionType[] = ['release', 'beta', 'alpha'];
const HTTP_NOT_FOUND = 404;
const HTTP_UNAUTHORIZED = 401;
const INDENT = 2;

/** Antwort von Modrinth, wenn etwas nicht klappt. */
interface ApiError {
  readonly error?: string;
  readonly description?: string;
}

/** Felder für `data` im Upload (Namen wie in der Modrinth-API). */
export interface VersionUpload {
  readonly project_id: string;
  readonly name: string;
  readonly version_number: string;
  readonly changelog: string;
  readonly dependencies: readonly never[];
  readonly game_versions: readonly string[];
  readonly version_type: VersionType;
  readonly loaders: readonly string[];
  readonly featured: boolean;
  readonly file_parts: readonly string[];
  readonly primary_file: string;
}

const FILE_PART = 'file';

export function versionUpload(
  release: ReleaseInfo,
  projectId: string,
  changelog: string,
  type: VersionType,
): VersionUpload {
  return {
    project_id: projectId,
    name: release.name,
    version_number: release.versionNumber,
    changelog,
    // Leer: Modrinth liest die enthaltenen Mods selbst aus der .mrpack.
    dependencies: [],
    game_versions: release.gameVersions,
    version_type: type,
    loaders: release.loaders,
    featured: true,
    file_parts: [FILE_PART],
    primary_file: FILE_PART,
  };
}

function headers(token: string): Record<string, string> {
  return { Authorization: token, 'User-Agent': userAgent() };
}

function parseError(text: string): ApiError {
  try {
    return JSON.parse(text) as ApiError;
  } catch {
    return { description: text.trim() || undefined };
  }
}

async function explain(response: Response): Promise<string> {
  const body = parseError(await response.text());
  return `${response.status} ${body.description ?? body.error ?? response.statusText}`;
}

async function projectId(
  project: string,
  token: string,
): Promise<{ readonly id: string; readonly slug: string }> {
  const response = await fetch(`${MODRINTH_API}/project/${encodeURIComponent(project)}`, {
    headers: headers(token),
  });
  if (response.status === HTTP_NOT_FOUND) {
    throw new Error(
      `Projekt „${project}“ gibt es bei Modrinth nicht (oder der Schlüssel darf es nicht sehen). Erst auf modrinth.com anlegen.`,
    );
  }
  if (response.status === HTTP_UNAUTHORIZED)
    throw new Error('Der Schlüssel (MODRINTH_TOKEN) wird nicht angenommen.');
  if (!response.ok) throw new Error(`Projekt abfragen: ${await explain(response)}`);
  return (await response.json()) as { id: string; slug: string };
}

async function versionExists(id: string, versionNumber: string, token: string): Promise<boolean> {
  const response = await fetch(`${MODRINTH_API}/project/${id}/version`, { headers: headers(token) });
  if (!response.ok) throw new Error(`Versionen abfragen: ${await explain(response)}`);
  const versions = (await response.json()) as { version_number: string }[];
  return versions.some((v) => v.version_number === versionNumber);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { type: { type: 'string', default: 'release' }, trocken: { type: 'boolean', default: false } },
    allowPositionals: false,
  });
  const type = VERSION_TYPES.find((t) => t === values.type);
  if (type === undefined) throw new Error(`--type muss ${VERSION_TYPES.join(', ')} sein`);
  if (!existsSync(path.join(DIST_DIR, 'release.json'))) {
    throw new Error('Noch keine Packung gebaut. Erst: pnpm --filter @moinmorni/modpack build');
  }
  const release = readRelease(DIST_DIR);
  const packPath = path.join(DIST_DIR, release.file);
  if (!existsSync(packPath)) throw new Error(`${release.file} fehlt in dist/ – bitte neu bauen.`);
  const pack = readFileSync(packPath);
  const changelog = readFileSync(path.join(DIST_DIR, release.changelogFile), 'utf8');
  const project = process.env['MODRINTH_PROJECT'] ?? DEFAULT_PROJECT;

  if (values.trocken) {
    const data = versionUpload(release, `<ID von ${project}>`, changelog, type);
    console.log('Trockenlauf – so sähe der Upload aus (ohne Änderungstext):');
    console.log(
      JSON.stringify(
        { ...data, changelog: `(${changelog.length} Zeichen aus ${release.changelogFile})` },
        null,
        INDENT,
      ),
    );
    console.log(`Datei: ${release.file} (${pack.length} Bytes, ${MRPACK_TYPE})`);
    return;
  }

  const token = process.env['MODRINTH_TOKEN'];
  if (!token) {
    console.log('Ohne Schlüssel geht es nicht – es wurde nichts hochgeladen.');
    console.log(
      'So geht es: Auf modrinth.com → Einstellungen → „Personal access tokens“ einen Schlüssel mit',
    );
    console.log('„Create versions“ anlegen, dann im Terminal (nicht ins Repo schreiben!):');
    console.log('  MODRINTH_TOKEN=mrp_… pnpm --filter @moinmorni/modpack publish:modrinth');
    process.exitCode = 1;
    return;
  }

  const target = await projectId(project, token);
  if (await versionExists(target.id, release.versionNumber, token)) {
    throw new Error(
      `Version ${release.versionNumber} gibt es dort schon. Neu bauen mit: build -- --version ${release.versionNumber}b`,
    );
  }
  const form = new FormData();
  form.append('data', JSON.stringify(versionUpload(release, target.id, changelog, type)));
  form.append(FILE_PART, new Blob([pack], { type: MRPACK_TYPE }), release.file);
  const response = await fetch(`${MODRINTH_API}/version`, {
    method: 'POST',
    headers: headers(token),
    body: form,
  });
  if (!response.ok) throw new Error(`Hochladen: ${await explain(response)}`);
  console.log(
    `Hochgeladen: https://modrinth.com/modpack/${target.slug}/version/${encodeURIComponent(release.versionNumber)}`,
  );
}

if (startedDirectly(import.meta.url)) await run(main, 'Hochladen hat nicht geklappt');
