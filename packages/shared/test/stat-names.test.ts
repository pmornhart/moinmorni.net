import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_MODES,
  MODE_STAT_KEYS,
  statHasOwnName,
  statName,
  statPart,
  statSubjectName,
  type StatTextLookup,
} from '../src/index.js';

/**
 * Jeder Wert, den ein Spielmodus meldet, hat auf der Webseite einen echten Namen – auf Deutsch und Englisch, im Profil
 * und in den Bestenlisten. Vorher stand dort z. B. „Runs“, „Best score“ oder „Edelweiss jagd“ (aus dem Schlüssel
 * gebaut).
 */

const here = dirname(fileURLToPath(import.meta.url));
const I18N = join(here, '..', '..', '..', 'apps', 'web', 'src', 'i18n');
type Tree = { readonly [key: string]: Tree | string };
const LANGUAGES = ['de', 'en'] as const;
const trees = Object.fromEntries(
  LANGUAGES.map((lang) => [lang, JSON.parse(readFileSync(join(I18N, `${lang}.json`), 'utf8')) as Tree]),
) as Record<(typeof LANGUAGES)[number], Tree>;

/** Wie i18next: Punkt-Pfad nachschlagen, `{{what}}`/`{{course}}` einsetzen; '' = fehlt. */
function lookup(tree: Tree): StatTextLookup {
  return (key, what = '') => {
    const found = key
      .split('.')
      .reduce<Tree | string | undefined>(
        (node, part) => (node && typeof node === 'object' ? node[part] : undefined),
        tree,
      );
    return typeof found === 'string' ? found.replaceAll('{{what}}', what).replaceAll('{{course}}', what) : '';
  };
}

describe('Namen der Statistik-Werte', () => {
  test('jeder Modus mit Statistik ist ein echter Modus (oder die Lobby)', () => {
    const ids = new Set(['lobby', ...DEFAULT_MODES.map((m) => m.id)]);
    expect(Object.keys(MODE_STAT_KEYS).filter((m) => !ids.has(m))).toEqual([]);
  });

  test.each(LANGUAGES)('jeder gemeldete Wert hat einen Namen (%s)', (lang) => {
    const text = lookup(trees[lang]);
    const missing = Object.entries(MODE_STAT_KEYS).flatMap(([mode, keys]) =>
      keys.filter((key) => !statName(text, key, mode, lang)).map((key) => `${mode}: ${key}`),
    );
    expect(missing).toEqual([]);
  });

  test.each(LANGUAGES)(
    'jede Kampfart, Spielart und Strecke hat einen Namen und ihre Spalte einen Kopf (%s)',
    (lang) => {
      const text = lookup(trees[lang]);
      const missing = Object.entries(MODE_STAT_KEYS).flatMap(([mode, keys]) =>
        keys.flatMap((key) => {
          // Mit eigenem Namen wird ein Wert nicht zerlegt ("wins_hider" in Versteckerl).
          const part = statHasOwnName(text, key, mode) ? null : statPart(key);
          if (!part) return [];
          return [
            statSubjectName(text, part.subject, mode, lang) ? null : `${mode}: ${part.subject}`,
            statName(text, part.kind, mode, lang) ? null : `${mode}: Spalte ${part.kind}`,
          ].filter((m): m is string => m !== null);
        }),
      );
      expect([...new Set(missing)]).toEqual([]);
    },
  );

  test('Beispiele: eigene Wörter des Modus vor den allgemeinen', () => {
    const de = lookup(trees.de);
    const en = lookup(trees.en);
    expect(statName(de, 'runs', 'burgverlies', 'de')).toBe('Abstiege');
    expect(statName(en, 'best_score', 'burgverlies', 'en')).toBe('Best score');
    expect(statName(de, 'revives', 'bollwerk', 'de')).toBe('Mitspieler gerettet');
    expect(statName(de, 'games_edelweiss_jagd', 'party', 'de')).toBe('Partien Edelweiß-Jagd');
    expect(statName(en, 'wins_tatzelwurm', 'party', 'en')).toBe('Wins The Tatzelwurm');
    expect(statName(de, 'time_gipfelkreuz_ms', 'gipfelsturm', 'de')).toBe('Bestzeit Gipfelkreuz-Sprint');
    expect(statName(de, 'time_gipfelkreuz_ms', 'adlerflug', 'de')).toBe('Bestzeit Gipfelkreuz');
    expect(statName(de, 'games_sumo', 'duels', 'de')).toBe('Kämpfe Sumo');
    // Unbekanntes bleibt leer – die Webseite zeigt dann den Schlüssel lesbar.
    expect(statName(de, 'gibts_nicht', 'duels', 'de')).toBe('');
  });
});
