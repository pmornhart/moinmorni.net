/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';
import { MODE_REPOS, MODE_SETTING_AREAS, settingsOf, type SettingDef } from '../src/index.js';

/**
 * Standardwerte im Panel = Werte der config.yml, die der Modus mitbringt. Ohne Änderung im Panel darf MoinMorni dort
 * nichts umstellen. Kopien der config.yml liegen in `test/mode-configs/<modus>.yml`. Mit `MM_CHECK_MODE_REPOS=1` wird
 * zusätzlich verglichen, ob der veröffentlichte Stand der Repos daneben (`../<repo>`, Zweig `origin/main` – vorher
 * `git -C ../<repo> fetch origin main`) noch dieselbe config.yml hat – sonst hat ein Modus etwas geändert, und Kopie
 * und Katalog müssen mit. Auf welchem Zweig die Repos gerade stehen, ist dafür egal; ohne Git zählt die Datei im Ordner.
 */

const HERE = import.meta.dirname;
const COPIES = path.join(HERE, 'mode-configs');
/** Ordner, in dem die Repos der Modi neben moinmorni.net liegen (wie in der Entwicklung). */
const NEIGHBOURS = path.resolve(HERE, '../../../..');
const CONFIG_IN_REPO = 'src/main/resources/config.yml';
// Stelle in einer Liste am Ende eines Pfads: "edelweiss-jagd-runden.2" → Liste "edelweiss-jagd-runden", Stelle 2;
// "ankauf.stufen.1.prozent" (Feld eines Eintrags) passt nicht.
// https://regex101.com/?flavor=javascript&regex=%5E(.%2B)%5C.(%5Cd%2B)%24&testString=edelweiss-jagd-runden.2
const LIST_ENTRY = /^(.+)\.(\d+)$/;

type Yaml = Record<string, unknown>;

/** Wert an einem Pfad der config.yml; eine Zahl als Teil zeigt in eine Liste (wie im Netzwerk-Plugin). */
function at(config: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((node, part) => {
    if (Array.isArray(node)) return node[Number(part)];
    if (node && typeof node === 'object') return (node as Yaml)[part];
    return undefined;
  }, config);
}

function expected(config: unknown, def: SettingDef): unknown {
  const value = at(config, def.config?.path ?? '');
  // Auswahl-Listen (z. B. Minispiele): an = steht in der Liste.
  if (def.config?.member) return Array.isArray(value) && value.includes(def.config.member);
  return value;
}

/** config.yml im veröffentlichten Stand (origin/main) des Repos daneben – ohne Git die Datei im Ordner. */
function published(repoDir: string): string | null {
  try {
    return execFileSync('git', ['-C', repoDir, 'show', `origin/main:${CONFIG_IN_REPO}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    const file = path.join(repoDir, CONFIG_IN_REPO);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  }
}

describe('Standardwerte = mitgelieferte config.yml', () => {
  test.each(MODE_SETTING_AREAS.map((a) => [a.id, a] as const))('%s', (id, area) => {
    const file = path.join(COPIES, `${area.mode?.id ?? id}.yml`);
    expect(fs.existsSync(file), `Kopie der config.yml fehlt: ${file}`).toBe(true);
    const text = fs.readFileSync(file, 'utf8');
    const config = parse(text) as unknown;
    settingsOf(area).forEach((def) => {
      const want = expected(config, def);
      expect(want, `${id}.${def.key}: ${def.config?.path} fehlt in der config.yml`).not.toBeUndefined();
      // Auswahl-Listen ohne Eintrag = alle an (so liest es der Modus).
      const all =
        def.config?.member &&
        Array.isArray(at(config, def.config.path)) &&
        !(at(config, def.config.path) as unknown[]).length;
      expect(def.default, `${id}.${def.key} (${def.config?.path})`).toEqual(all ? true : want);
    });
    // Listen aus Zahlen (Rundenzahlen zur Wahl, Taler je Platz …) gehen als ganze Liste an den Modus – der Katalog
    // braucht darum jede Stelle, sonst würde die Liste beim Eintragen kürzer.
    const lists = settingsOf(area).reduce<Map<string, number[]>>((byList, def) => {
      const [, list, index] = LIST_ENTRY.exec(def.config?.path ?? '') ?? [];
      if (list && index) byList.set(list, [...(byList.get(list) ?? []), Number(index)]);
      return byList;
    }, new Map());
    lists.forEach((indexes, list) => {
      const value = at(config, list);
      expect(Array.isArray(value), `${id}: ${list} ist keine Liste`).toBe(true);
      expect(
        [...indexes].sort((a, b) => a - b),
        `${id}: ${list} – jede Stelle der Liste gehört in den Katalog`,
      ).toEqual((value as unknown[]).map((_, i) => i));
    });
    // Liegt das Repo daneben: Kopie muss dem veröffentlichten Stand entsprechen.
    const repo = MODE_REPOS[area.mode?.id ?? ''];
    const dir = repo ? path.join(NEIGHBOURS, repo.split('/')[1]!.toLowerCase()) : '';
    const live =
      process.env['MM_CHECK_MODE_REPOS'] === '1' && dir && fs.existsSync(dir) ? published(dir) : null;
    if (live !== null)
      expect(live, `${dir} (origin/main) hat eine andere config.yml – Kopie und Katalog nachziehen`).toBe(
        text,
      );
  });
});
