/**
 * Das Modpack im Modrinth-Format (.mrpack, https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack):
 * eine ZIP-Datei mit `modrinth.index.json` (welche Mods, woher, mit Prüfsummen) und `overrides/` (Dateien, die so ins
 * Spiel-Verzeichnis kommen). Die Mods selbst stecken nicht drin – der Launcher lädt sie von Modrinth.
 */
import { zipOf } from '@morninet/builder';
import { GROUP_NAMES, type Excluded, type Group, type ModSpec } from './mods.js';
import type { ModrinthFile, VersionType } from './modrinth.js';

export type EnvSide = 'required' | 'optional' | 'unsupported';

export interface IndexFile {
  readonly path: string;
  readonly hashes: { readonly sha1: string; readonly sha512: string };
  readonly env: { readonly client: EnvSide; readonly server: EnvSide };
  readonly downloads: readonly string[];
  readonly fileSize: number;
}

export interface ModrinthIndex {
  readonly formatVersion: 1;
  readonly game: 'minecraft';
  readonly versionId: string;
  readonly name: string;
  readonly summary: string;
  readonly files: readonly IndexFile[];
  readonly dependencies: Readonly<Record<string, string>>;
}

/** Eine Mod, wie sie ins Pack kommt. */
export interface PackMod {
  readonly projectId: string;
  readonly slug: string;
  readonly title: string;
  readonly versionId: string;
  readonly versionNumber: string;
  readonly versionType: VersionType;
  readonly license: string;
  readonly licenseUrl: string | null;
  readonly file: ModrinthFile;
  readonly env: { readonly client: EnvSide; readonly server: EnvSide };
  /** Aus der Liste in `mods.ts`; fehlt bei automatisch mitgenommenen Abhängigkeiten. */
  readonly spec: ModSpec | undefined;
  /** Namen der Mods, die diese als Pflicht brauchen. */
  readonly neededBy: readonly string[];
}

export interface PackInput {
  readonly versionId: string;
  readonly name: string;
  readonly summary: string;
  readonly minecraft: string;
  readonly loader: string;
  readonly loaderVersion: string;
  readonly mods: readonly PackMod[];
}

/** Von hier dürfen Launcher laut Modrinth-Format Dateien laden. */
export const ALLOWED_DOWNLOAD_HOSTS: readonly string[] = [
  'cdn.modrinth.com',
  'github.com',
  'raw.githubusercontent.com',
  'gitlab.com',
];

/** Schlüssel für den Lader in `dependencies` (laut Modrinth-Format). */
const LOADER_KEYS: Readonly<Record<string, string>> = {
  fabric: 'fabric-loader',
  quilt: 'quilt-loader',
  forge: 'forge',
  neoforge: 'neoforge',
};

export function loaderKey(loader: string): string {
  const key = LOADER_KEYS[loader];
  if (key === undefined) throw new Error(`Unbekannter Lader „${loader}“`);
  return key;
}

export function packIndex(input: PackInput): ModrinthIndex {
  const files: IndexFile[] = input.mods
    .map((mod) => ({
      path: `mods/${mod.file.filename}`,
      hashes: { sha1: mod.file.hashes.sha1, sha512: mod.file.hashes.sha512 },
      env: mod.env,
      downloads: [mod.file.url],
      fileSize: mod.file.size,
    }))
    .toSorted((a, b) => a.path.localeCompare(b.path));
  return {
    formatVersion: 1,
    game: 'minecraft',
    versionId: input.versionId,
    name: input.name,
    summary: input.summary,
    files,
    dependencies: { minecraft: input.minecraft, [loaderKey(input.loader)]: input.loaderVersion },
  };
}

// SHA-1 als 40 Kleinbuchstaben-Hexziffern: passt auf "da39a3ee5e6b4b0d3255bfef95601890afd80709", nicht auf "DA39…" oder "xyz".
// https://regex101.com/?flavor=javascript&regex=%5E%5B0-9a-f%5D%7B40%7D%24&testString=da39a3ee5e6b4b0d3255bfef95601890afd80709
const SHA1 = /^[0-9a-f]{40}$/;
// SHA-512 als 128 Kleinbuchstaben-Hexziffern: passt auf "cf83e1357eefb8bd…" (volle Länge), nicht auf "cf83" (zu kurz).
// https://regex101.com/?flavor=javascript&regex=%5E%5B0-9a-f%5D%7B128%7D%24&testString=cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e
const SHA512 = /^[0-9a-f]{128}$/;
// Unsichere Teile eines Pfads im Pack: passt auf "../x", "a/../b", "/abs", "C:\x" und "a\b", nicht auf "mods/sodium.jar".
// https://regex101.com/?flavor=javascript&regex=(%5E%7C%2F)%5C.%5C.(%2F%7C%24)%7C%5E%2F%7C%5C%5C%7C%3A&testString=..%2Fx%0Amods%2Fsodium.jar
const UNSAFE_PATH = /(^|\/)\.\.(\/|$)|^\/|\\|:/;

const ENV_SIDES: readonly EnvSide[] = ['required', 'optional', 'unsupported'];

function fileProblems(file: IndexFile): string[] {
  const where = file.path || '(ohne Pfad)';
  const hostOk = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && ALLOWED_DOWNLOAD_HOSTS.includes(parsed.hostname);
    } catch {
      return false;
    }
  };
  const checks: readonly (readonly [boolean, string])[] = [
    [file.path.length > 0 && !UNSAFE_PATH.test(file.path), `${where}: Pfad ist nicht sicher`],
    [SHA1.test(file.hashes.sha1), `${where}: sha1 fehlt oder ist falsch`],
    [SHA512.test(file.hashes.sha512), `${where}: sha512 fehlt oder ist falsch`],
    [file.downloads.length > 0, `${where}: keine Download-Adresse`],
    [
      file.downloads.every(hostOk),
      `${where}: Download nicht von einer erlaubten Seite (${ALLOWED_DOWNLOAD_HOSTS.join(', ')})`,
    ],
    [Number.isInteger(file.fileSize) && file.fileSize > 0, `${where}: Dateigröße fehlt`],
    [
      ENV_SIDES.includes(file.env.client) && ENV_SIDES.includes(file.env.server),
      `${where}: env ist ungültig`,
    ],
  ];
  return checks.filter(([ok]) => !ok).map(([, text]) => text);
}

/** Prüft die Pflichtfelder des Modrinth-Formats. Leere Liste = alles in Ordnung. */
export function indexProblems(index: ModrinthIndex): string[] {
  const paths = index.files.map((f) => f.path);
  const doubled = paths.filter((p, i) => paths.indexOf(p) !== i);
  const checks: readonly (readonly [boolean, string])[] = [
    [index.formatVersion === 1, 'formatVersion muss 1 sein'],
    [index.game === 'minecraft', 'game muss „minecraft“ sein'],
    [index.versionId.trim().length > 0, 'versionId fehlt'],
    [index.name.trim().length > 0, 'name fehlt'],
    [typeof index.dependencies['minecraft'] === 'string', 'dependencies.minecraft fehlt'],
    [Object.keys(index.dependencies).some((k) => k !== 'minecraft'), 'Lader fehlt in dependencies'],
    [index.files.length > 0, 'keine Dateien'],
    [doubled.length === 0, `doppelte Pfade: ${[...new Set(doubled)].join(', ')}`],
  ];
  return [...checks.filter(([ok]) => !ok).map(([, text]) => text), ...index.files.flatMap(fileProblems)];
}

export interface PackFile {
  /** Pfad im Spiel-Verzeichnis, z. B. `servers.dat`. */
  readonly path: string;
  readonly data: Buffer;
}

const INDENT = 2;

/** Die fertige .mrpack-Datei: Index + Dateien unter `overrides/`. */
export function mrpack(index: ModrinthIndex, overrides: readonly PackFile[]): Buffer {
  const unsafe = overrides.find((f) => UNSAFE_PATH.test(f.path) || f.path.length === 0);
  if (unsafe) throw new Error(`Unsicherer Pfad in overrides: ${unsafe.path}`);
  return zipOf([
    { name: 'modrinth.index.json', data: Buffer.from(`${JSON.stringify(index, null, INDENT)}\n`, 'utf8') },
    ...overrides.map((f) => ({ name: `overrides/${f.path}`, data: f.data })),
  ]);
}

const DATE_LENGTH = 10;

/** Version des Packs: Minecraft-Version + Tag, z. B. `26.3-2026.11.14`. */
export function packVersion(minecraft: string, date: Date): string {
  return `${minecraft}-${date.toISOString().slice(0, DATE_LENGTH).replaceAll('-', '.')}`;
}

const ENV_TEXT: Readonly<Record<EnvSide, string>> = {
  required: 'Pflicht',
  optional: 'optional',
  unsupported: '–',
};

const GROUP_ORDER: readonly Group[] = ['grundlage', 'leistung', 'aussehen', 'spielhilfe', 'bauen'];

// Vorsilbe eigener Lizenzen (SPDX): passt auf "LicenseRef-All-Rights-Reserved", nicht auf "MIT".
// https://regex101.com/?flavor=javascript&regex=%5ELicenseRef-&testString=LicenseRef-All-Rights-Reserved%0AMIT
const LICENSE_REF = /^LicenseRef-/;

function licenseCell(mod: PackMod): string {
  const name = mod.license.replace(LICENSE_REF, '');
  return mod.licenseUrl ? `[${name}](${mod.licenseUrl})` : name;
}

function modLink(mod: PackMod): string {
  return `[${mod.title}](https://modrinth.com/mod/${mod.slug})`;
}

function stability(mod: PackMod): string {
  return mod.versionType === 'release' ? '' : ` (${mod.versionType})`;
}

export interface ModsReport {
  readonly versionId: string;
  readonly minecraft: string;
  readonly loaderVersion: string;
  readonly mods: readonly PackMod[];
  /** Mods aus der Liste ohne passende Version. */
  readonly missing: readonly ModSpec[];
  /** Hinweise beim Zusammenstellen (übersprungene Abhängigkeiten, genau verlangte Versionen …). */
  readonly notes: readonly string[];
  readonly leftOut: readonly Excluded[];
  readonly forbidden: readonly Excluded[];
}

/** Übersicht als Markdown (`dist/mods.md`, dient auch als Änderungstext auf Modrinth). */
export function modsMarkdown(report: ModsReport): string {
  const listed = report.mods.filter((m) => m.spec !== undefined);
  const deps = report.mods
    .filter((m) => m.spec === undefined)
    .toSorted((a, b) => a.title.localeCompare(b.title));
  const groups = GROUP_ORDER.flatMap((group) => {
    const mods = listed.filter((m) => m.spec?.group === group);
    if (mods.length === 0) return [];
    return [
      `### ${GROUP_NAMES[group]}`,
      '',
      '| Mod | Version | Lizenz | Wofür | Im Spiel |',
      '| --- | --- | --- | --- | --- |',
      ...mods.map(
        (m) =>
          `| ${modLink(m)} | ${m.versionNumber}${stability(m)} | ${licenseCell(m)} | ${m.spec?.purpose ?? ''} | ${ENV_TEXT[m.env.client]} |`,
      ),
      '',
    ];
  });
  const depLines =
    deps.length === 0
      ? []
      : [
          '### Automatisch dabei (gebraucht von anderen Mods)',
          '',
          '| Mod | Version | Lizenz | gebraucht von |',
          '| --- | --- | --- | --- |',
          ...deps.map(
            (m) =>
              `| ${modLink(m)} | ${m.versionNumber}${stability(m)} | ${licenseCell(m)} | ${m.neededBy.join(', ')} |`,
          ),
          '',
        ];
  const missing = report.missing.map(
    (m) => `- ${m.slug}: gibt es nicht für Fabric ${report.minecraft} – weggelassen`,
  );
  const notLines = [
    ...missing,
    ...report.leftOut.map((m) => `- ${m.slug}: ${m.reason}`),
    ...report.forbidden.map((m) => `- ${m.slug}: ${m.reason}`),
  ];
  return [
    `# morni.net-Modpack ${report.versionId}`,
    '',
    `Minecraft ${report.minecraft} · Fabric Loader ${report.loaderVersion} · ${report.mods.length} Mods`,
    '',
    ...groups,
    ...depLines,
    '### Nicht dabei',
    '',
    ...notLines,
    '',
    ...(report.notes.length > 0 ? ['### Hinweise', '', ...report.notes.map((n) => `- ${n}`), ''] : []),
    'Die Mods kommen direkt von Modrinth; das Pack enthält nur Verweise und die Serverliste.',
    '',
  ].join('\n');
}
