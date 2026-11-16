/** Gemeinsames für Bauen und Hochladen: Ordner, Kennung gegenüber Modrinth, Angaben zur fertigen Packung. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
export const DIST_DIR = path.join(PACKAGE_DIR, 'dist');

/** Modrinth bittet jedes Programm, sich mit Namen und Kontakt zu melden. */
export function userAgent(): string {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as { version: string };
  return `MoinMorni-Modpack/${pkg.version} (+https://moinmorni.net)`;
}

/** Steht nach dem Bauen in `dist/release.json` und sagt `publish.ts`, was hochgeladen wird. */
export interface ReleaseInfo {
  readonly name: string;
  readonly versionNumber: string;
  readonly file: string;
  readonly gameVersions: readonly string[];
  readonly loaders: readonly string[];
  readonly changelogFile: string;
  readonly builtAt: string;
}

export function readRelease(dir: string): ReleaseInfo {
  return JSON.parse(readFileSync(path.join(dir, 'release.json'), 'utf8')) as ReleaseInfo;
}

/** Wurde diese Datei direkt gestartet (und nicht nur importiert, z. B. von einem Test)? */
export function startedDirectly(moduleUrl: string): boolean {
  const script = process.argv[1];
  return script !== undefined && path.resolve(script) === fileURLToPath(moduleUrl);
}

/** Führt ein Skript aus; Fehler erscheinen als ein freundlicher Satz statt als Stapel von Programmzeilen. */
export async function run(task: () => Promise<void>, failure: string): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.error(`${failure}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
