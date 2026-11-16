/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';
import { MODE_REPOS, MODE_SETTING_AREAS, settingsOf, type SettingDef } from '../src/index.js';

/**
 * Standardwerte im Panel = Werte der config.yml, die der Modus mitbringt. Ohne Änderung im Panel darf MoinMorni dort
 * nichts umstellen. Kopien der config.yml liegen in `test/mode-configs/<modus>.yml`. Mit `MM_CHECK_MODE_REPOS=1` wird
 * zusätzlich verglichen, ob die Repos der Modi daneben (`../<repo>`) noch dieselbe config.yml haben – sonst hat ein
 * Modus etwas geändert, und Kopie und Katalog müssen mit (die Repos können gerade auf anderen Branches stehen).
 */

const HERE = import.meta.dirname;
const COPIES = path.join(HERE, 'mode-configs');
/** Ordner, in dem die Repos der Modi neben moinmorni.net liegen (wie in der Entwicklung). */
const NEIGHBOURS = path.resolve(HERE, '../../../..');

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
    // Liegt das Repo daneben: Kopie muss aktuell sein.
    const repo = MODE_REPOS[area.mode?.id ?? ''];
    const local = repo
      ? path.join(NEIGHBOURS, repo.split('/')[1]!.toLowerCase(), 'src/main/resources/config.yml')
      : '';
    if (process.env['MM_CHECK_MODE_REPOS'] === '1' && local && fs.existsSync(local))
      expect(
        fs.readFileSync(local, 'utf8'),
        `${local} hat sich geändert – Kopie und Katalog nachziehen`,
      ).toBe(text);
  });
});
