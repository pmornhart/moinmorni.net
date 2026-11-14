/**
 * Baut das MoinMorni-Modpack: fragt Modrinth nach den passenden Mod-Versionen, holt Pflicht-Abhängigkeiten dazu und
 * schreibt nach `tools/modpack/dist/`:
 * - `MoinMorni-<version>.mrpack` – das Pack (Index + Serverliste)
 * - `mods.md` – Übersicht mit Version und Lizenz jeder Mod
 * - `release.json` – Angaben fürs Hochladen (`src/publish.ts`)
 *
 * Aufruf: `pnpm --filter @moinmorni/modpack build [-- --version 26.3-2026.11.14b] [--out <ordner>]`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { packMods, projectIds, resolutionNotes } from './assemble.js';
import { DIST_DIR, run, startedDirectly, userAgent, type ReleaseInfo } from './common.js';
import {
  FORBIDDEN,
  LEFT_OUT,
  LOADER,
  LOADER_NAME,
  MINECRAFT_VERSION,
  MODS,
  PACK_NAME,
  PACK_SUMMARY,
  SERVER_ADDRESS,
  SERVER_NAME,
} from './mods.js';
import { modrinthApi, problems, resolveMods } from './modrinth.js';
import { serversDat } from './nbt.js';
import { indexProblems, modsMarkdown, mrpack, packIndex, packVersion } from './pack.js';

const FABRIC_LOADERS = 'https://meta.fabricmc.net/v2/versions/loader';
const INDENT = 2;

interface FabricLoader {
  readonly version: string;
  readonly stable: boolean;
}

/** Neueste stabile Version des Fabric-Laders (https://meta.fabricmc.net). */
async function stableFabricLoader(agent: string): Promise<string> {
  const response = await fetch(FABRIC_LOADERS, { headers: { 'User-Agent': agent } });
  if (!response.ok) throw new Error(`Fabric-Liste antwortet mit ${response.status}`);
  const loaders = (await response.json()) as FabricLoader[];
  const stable = loaders.find((l) => l.stable);
  if (stable === undefined) throw new Error('Keine stabile Fabric-Version gefunden');
  return stable.version;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { version: { type: 'string' }, out: { type: 'string' } },
    allowPositionals: false,
  });
  const out = path.resolve(values.out ?? DIST_DIR);
  const agent = userAgent();
  const api = modrinthApi(agent);
  const target = { gameVersion: MINECRAFT_VERSION, loader: LOADER };

  console.log(`Suche ${MODS.length} Mods für ${LOADER_NAME} ${MINECRAFT_VERSION} bei Modrinth …`);
  const [resolution, loaderVersion] = await Promise.all([
    resolveMods(api, MODS, target),
    stableFabricLoader(agent),
  ]);
  const projects = new Map((await api.projects(projectIds(resolution))).map((p) => [p.id, p]));

  const trouble = problems(resolution.chosen, projects);
  if (trouble.length > 0)
    throw new Error(`Das Pack wäre so nicht in Ordnung:\n- ${trouble.map((t) => t.text).join('\n- ')}`);

  const mods = packMods(resolution, projects);
  const versionId = values.version ?? packVersion(MINECRAFT_VERSION, new Date());
  const index = packIndex({
    versionId,
    name: PACK_NAME,
    summary: PACK_SUMMARY,
    minecraft: MINECRAFT_VERSION,
    loader: LOADER,
    loaderVersion,
    mods,
  });
  const issues = indexProblems(index);
  if (issues.length > 0)
    throw new Error(`modrinth.index.json ist nicht in Ordnung:\n- ${issues.join('\n- ')}`);

  const pack = mrpack(index, [
    { path: 'servers.dat', data: serversDat([{ name: SERVER_NAME, ip: SERVER_ADDRESS }]) },
  ]);
  const notes = resolutionNotes(resolution, projects, `${LOADER_NAME} ${MINECRAFT_VERSION}`);
  const markdown = modsMarkdown({
    versionId,
    minecraft: MINECRAFT_VERSION,
    loaderVersion,
    mods,
    missing: resolution.missing,
    notes,
    leftOut: LEFT_OUT,
    forbidden: FORBIDDEN,
  });

  const file = `${PACK_NAME}-${versionId}.mrpack`;
  const release: ReleaseInfo = {
    name: `${PACK_NAME} ${versionId}`,
    versionNumber: versionId,
    file,
    gameVersions: [MINECRAFT_VERSION],
    loaders: [LOADER],
    changelogFile: 'mods.md',
    builtAt: new Date().toISOString(),
  };
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, file), pack);
  writeFileSync(path.join(out, 'mods.md'), markdown);
  writeFileSync(path.join(out, 'release.json'), `${JSON.stringify(release, null, INDENT)}\n`);

  const optional = mods.filter((m) => m.env.client === 'optional').length;
  console.log(
    `Fertig: ${path.join(out, file)} (${mods.length} Mods, davon ${optional} optional, Fabric Loader ${loaderVersion})`,
  );
  resolution.missing.forEach((m) =>
    console.log(`  fehlt: ${m.slug} (keine Version für ${LOADER_NAME} ${MINECRAFT_VERSION})`),
  );
  notes.forEach((n) => console.log(`  Hinweis: ${n}`));
  console.log(`Übersicht: ${path.join(out, 'mods.md')}`);
}

if (startedDirectly(import.meta.url)) await run(main, 'Bauen hat nicht geklappt');
