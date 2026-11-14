/** Aus der Auswahl (welche Version von welcher Mod) wird die Liste fürs Pack – mit env-Angaben und Hinweisen. */
import type { Chosen, ModrinthProject, Resolution, Side } from './modrinth.js';
import { neededBy, primaryFile } from './modrinth.js';
import type { EnvSide, PackMod } from './pack.js';

function serverSide(chosen: Chosen, project: ModrinthProject): EnvSide {
  if (project.server_side === 'unsupported' || chosen.spec?.clientOnly) return 'unsupported';
  return chosen.spec?.need === 'pflicht' ? 'required' : 'optional';
}

function clientSide(chosen: Chosen, side: Side): EnvSide {
  if (side === 'unsupported') return 'unsupported';
  // Abhängigkeiten sind immer Pflicht: wer im Launcher eine optionale Mod abwählt, behält sonst eine kaputte.
  return chosen.spec?.need === 'optional' ? 'optional' : 'required';
}

function titleOf(projects: ReadonlyMap<string, ModrinthProject>, id: string): string {
  return projects.get(id)?.title ?? id;
}

/** Reihenfolge: erst die Liste aus `mods.ts`, dann Abhängigkeiten nach Namen. */
export function packMods(resolution: Resolution, projects: ReadonlyMap<string, ModrinthProject>): PackMod[] {
  const mods = [...resolution.chosen.entries()].map(([id, chosen]): PackMod => {
    const project = projects.get(id);
    const file = primaryFile(chosen.version);
    if (project === undefined || file === undefined) throw new Error(`Angaben zu ${id} fehlen bei Modrinth`);
    return {
      projectId: id,
      slug: project.slug,
      title: project.title,
      versionId: chosen.version.id,
      versionNumber: chosen.version.version_number,
      versionType: chosen.version.version_type,
      license: project.license.id,
      licenseUrl: project.license.url,
      file,
      env: { client: clientSide(chosen, project.client_side), server: serverSide(chosen, project) },
      spec: chosen.spec,
      neededBy: neededBy(resolution.chosen, id).map((by) => titleOf(projects, by)),
    };
  });
  const listed = mods.filter((m) => m.spec !== undefined);
  const deps = mods.filter((m) => m.spec === undefined).toSorted((a, b) => a.title.localeCompare(b.title));
  return [...listed, ...deps];
}

/** Hinweise in Worten: übersprungene Abhängigkeiten, genau verlangte Versionen, Wünsche, die offen bleiben. */
export function resolutionNotes(
  resolution: Resolution,
  projects: ReadonlyMap<string, ModrinthProject>,
  target: string,
): string[] {
  const name = (id: string): string => titleOf(projects, id);
  const fromEvents = resolution.events.flatMap((event): string[] => {
    if (event.kind === 'skipped') {
      return [
        `${name(event.by)} nennt ${name(event.project)} als Pflicht – gibt es nicht für ${target}, übersprungen`,
      ];
    }
    if (event.kind === 'pinned') {
      return [
        `${name(event.by)} verlangt ${name(event.project)} genau in Version ${event.to} (statt ${event.from})`,
      ];
    }
    return [];
  });
  const unmet = [...resolution.chosen.entries()].flatMap(([by, chosen]) =>
    chosen.version.dependencies
      .filter((d) => d.dependency_type === 'required' && d.project_id !== null && d.version_id !== null)
      .filter((d) => {
        const have = resolution.chosen.get(d.project_id ?? '');
        return have !== undefined && have.version.id !== d.version_id;
      })
      .map((d) => {
        const have = resolution.chosen.get(d.project_id ?? '');
        return `${name(by)} wünscht sich eine andere Version von ${name(d.project_id ?? '')} – genommen: ${have?.version.version_number}`;
      }),
  );
  return [...fromEvents, ...unmet];
}

/** IDs aller Projekte, deren Namen für Pack und Hinweise gebraucht werden. */
export function projectIds(resolution: Resolution): string[] {
  const skipped = resolution.events.flatMap((e) => [e.project, e.by]);
  return [...new Set([...resolution.chosen.keys(), ...skipped])];
}
