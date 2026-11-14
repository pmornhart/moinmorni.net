import { describe, expect, test } from 'vitest';
import { packMods, projectIds, resolutionNotes } from '../src/assemble.js';
import type { ModSpec } from '../src/mods.js';
import {
  bestVersion,
  problems,
  resolveMods,
  type ModrinthDependency,
  type ModrinthProject,
  type ModrinthReader,
  type ModrinthVersion,
  type Target,
  type VersionType,
} from '../src/modrinth.js';

const TARGET: Target = { gameVersion: '26.3', loader: 'fabric' };
const SHA1 = 'a'.repeat(40); // eslint-disable-line ts-patterns/no-magic-numbers -- length of a SHA-1 in hex
const SHA512 = 'b'.repeat(128); // eslint-disable-line ts-patterns/no-magic-numbers -- length of a SHA-512 in hex

interface Fake {
  readonly id: string;
  readonly project: string;
  readonly number: string;
  readonly type?: VersionType;
  readonly date: string;
  readonly loaders?: readonly string[];
  readonly deps?: readonly ModrinthDependency[];
}

function version(fake: Fake): ModrinthVersion {
  return {
    id: fake.id,
    project_id: fake.project,
    version_number: fake.number,
    version_type: fake.type ?? 'release',
    date_published: fake.date,
    game_versions: ['26.3'],
    loaders: fake.loaders ?? ['fabric'],
    dependencies: fake.deps ?? [],
    files: [
      {
        url: `https://cdn.modrinth.com/${fake.id}-sources.jar`,
        filename: `${fake.id}-sources.jar`,
        primary: false,
        size: 1,
        hashes: { sha1: SHA1, sha512: SHA512 },
      },
      {
        url: `https://cdn.modrinth.com/${fake.id}.jar`,
        filename: `${fake.id}.jar`,
        primary: true,
        size: 1,
        hashes: { sha1: SHA1, sha512: SHA512 },
      },
    ],
  };
}

const need = (project: string, versionId: string | null = null): ModrinthDependency => ({
  project_id: project,
  version_id: versionId,
  dependency_type: 'required',
});

/** Kleine Modrinth-Welt: Projekt-ID = Slug, damit der Test lesbar bleibt. */
const VERSIONS: readonly ModrinthVersion[] = [
  version({
    id: 'zoom-1',
    project: 'zoom',
    number: '1.0',
    date: '2026-10-01',
    deps: [need('kotlin'), need('forge-kotlin')],
  }),
  version({ id: 'kotlin-1', project: 'kotlin', number: '1.14', date: '2026-10-01' }),
  version({
    id: 'forge-kotlin-1',
    project: 'forge-kotlin',
    number: '5.0',
    date: '2026-10-01',
    loaders: ['neoforge'],
  }),
  version({ id: 'render-stable', project: 'render', number: '0.9.2', date: '2026-09-15' }),
  version({ id: 'render-beta', project: 'render', number: '0.9.3-beta', type: 'beta', date: '2026-11-12' }),
  version({
    id: 'shader-1',
    project: 'shader',
    number: '1.11',
    date: '2026-09-30',
    deps: [need('render', 'render-stable')],
  }),
  version({ id: 'voice-beta', project: 'voice', number: '2.6.27', type: 'beta', date: '2026-10-28' }),
  version({ id: 'map-1', project: 'xaeros-minimap', number: '26', date: '2026-10-25' }),
  version({
    id: 'pins-old',
    project: 'pins',
    number: '1.0',
    date: '2026-10-01',
    deps: [need('render', 'render-beta')],
  }),
];

function project(id: string): ModrinthProject {
  return {
    id,
    slug: id,
    title: id.toUpperCase(),
    license: { id: 'MIT', name: 'MIT', url: null },
    client_side: 'required',
    server_side: 'unsupported',
  };
}

const fakeApi: ModrinthReader = {
  async versions(projectId) {
    return VERSIONS.filter((v) => v.project_id === projectId);
  },
  async version(id) {
    const found = VERSIONS.find((v) => v.id === id);
    if (!found) throw new Error(`unbekannte Version ${id}`);
    return found;
  },
  async projects(ids) {
    return ids.map(project);
  },
};

const spec = (slug: string, extra: Partial<ModSpec> = {}): ModSpec => ({
  slug,
  purpose: `Zweck von ${slug}`,
  need: 'pflicht',
  clientOnly: true,
  group: 'aussehen',
  ...extra,
});

describe('Mods zusammenstellen', () => {
  test('stabile Version vor neuerer Beta, Beta wenn es nichts anderes gibt', () => {
    expect(
      bestVersion(
        VERSIONS.filter((v) => v.project_id === 'render'),
        TARGET,
      )?.id,
    ).toBe('render-stable');
    expect(
      bestVersion(
        VERSIONS.filter((v) => v.project_id === 'voice'),
        TARGET,
      )?.id,
    ).toBe('voice-beta');
    expect(
      bestVersion(
        VERSIONS.filter((v) => v.project_id === 'forge-kotlin'),
        TARGET,
      ),
    ).toBeUndefined();
  });

  test('Pflicht-Abhängigkeiten kommen dazu, solche ohne Fabric-Version werden übersprungen und gemeldet', async () => {
    const resolution = await resolveMods(fakeApi, [spec('zoom'), spec('fehlt-ganz')], TARGET);
    expect([...resolution.chosen.keys()].sort()).toEqual(['kotlin', 'zoom']);
    expect(resolution.missing.map((m) => m.slug)).toEqual(['fehlt-ganz']);
    const projects = new Map(projectIds(resolution).map((id) => [id, project(id)]));
    expect(resolutionNotes(resolution, projects, 'Fabric 26.3')).toEqual([
      'ZOOM nennt FORGE-KOTLIN als Pflicht – gibt es nicht für Fabric 26.3, übersprungen',
    ]);
    const mods = packMods(resolution, projects);
    expect(mods.map((m) => [m.slug, m.env.client, m.neededBy])).toEqual([
      ['zoom', 'required', []],
      ['kotlin', 'required', ['ZOOM']],
    ]);
    expect(mods[0]?.file.filename).toBe('zoom-1.jar');
  });

  test('eine genau verlangte Version gewinnt und steht in den Hinweisen', async () => {
    const resolution = await resolveMods(fakeApi, [spec('pins'), spec('render')], TARGET);
    expect(resolution.chosen.get('render')?.version.id).toBe('render-beta');
    const projects = new Map(projectIds(resolution).map((id) => [id, project(id)]));
    expect(resolutionNotes(resolution, projects, 'Fabric 26.3')).toEqual([
      'PINS verlangt RENDER genau in Version 0.9.3-beta (statt 0.9.2)',
    ]);
  });

  test('zwei verschiedene Wünsche an dieselbe Mod: erster gewinnt, der andere steht als Hinweis da', async () => {
    const resolution = await resolveMods(fakeApi, [spec('shader'), spec('pins')], TARGET);
    const projects = new Map(projectIds(resolution).map((id) => [id, project(id)]));
    const notes = resolutionNotes(resolution, projects, 'Fabric 26.3');
    expect(resolution.chosen.get('render')?.version.id).toBeDefined();
    expect(notes.some((n) => n.includes('wünscht sich eine andere Version von RENDER'))).toBe(true);
  });

  test('optionale Mods bleiben optional, ihre Abhängigkeiten sind Pflicht', async () => {
    const resolution = await resolveMods(fakeApi, [spec('shader', { need: 'optional' })], TARGET);
    const projects = new Map(projectIds(resolution).map((id) => [id, project(id)]));
    expect(packMods(resolution, projects).map((m) => [m.slug, m.env.client])).toEqual([
      ['shader', 'optional'],
      ['render', 'required'],
    ]);
  });

  test('Minimap oder Axiom im Pack werden gemeldet', async () => {
    const resolution = await resolveMods(fakeApi, [spec('xaeros-minimap'), spec('zoom')], TARGET);
    const projects = new Map(projectIds(resolution).map((id) => [id, project(id)]));
    expect(problems(resolution.chosen, projects).map((p) => p.text)).toEqual([
      'xaeros-minimap darf nicht ins Pack (keine Minimap)',
    ]);
  });
});
