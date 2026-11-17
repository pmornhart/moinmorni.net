import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANGEL_BASE_ITEMS, ANGEL_FISH, ANGEL_MODEL_NAMES, angelModelName } from '../src/index.js';

/** „Name Gegenstand“ je Art, wie in der Liste von Angelkönig. */
const EXPECTED = ANGEL_FISH.map((f) => `${angelModelName(f.id)} ${f.base}`);

/**
 * Die Modell-Namen der Fische stehen in zwei Repos: hier (`angel-fische.ts`) und in Angelkönig (`FishModels.java`,
 * Liste in `docs/fisch-modelle.txt`). Die Kopie `angel-fische.txt` hält beide gleich; mit `MM_CHECK_MODE_REPOS=1`
 * wird zusätzlich mit dem Repo daneben verglichen (veröffentlichter Stand `origin/main`, sonst der Ordner).
 */
const HERE = import.meta.dirname;
const COPY = path.join(HERE, 'angel-fische.txt');
const NEIGHBOUR = path.resolve(HERE, '../../../..', 'morni-angelkoenig');
const LIST_IN_REPO = 'docs/fisch-modelle.txt';

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

function published(): string | null {
  try {
    return execFileSync('git', ['-C', NEIGHBOUR, 'show', `origin/main:${LIST_IN_REPO}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    const file = path.join(NEIGHBOUR, LIST_IN_REPO);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  }
}

describe('Fische im Angelkönig', () => {
  it('Modell-Namen und Gegenstände = Kopie der Liste aus Angelkönig', () => {
    expect(EXPECTED).toEqual(lines(fs.readFileSync(COPY, 'utf8')));
    expect(ANGEL_MODEL_NAMES).toEqual(EXPECTED.map((l) => l.split(' ')[0]));
  });

  it('jede Art einmal, Namen und Sätze in beiden Sprachen', () => {
    expect(new Set(ANGEL_FISH.map((f) => f.id)).size).toBe(ANGEL_FISH.length);
    ANGEL_FISH.forEach((f) => {
      expect(f.de && f.en && f.noteDe && f.noteEn, f.id).toBeTruthy();
      expect(angelModelName(f.id)).toBe(`moinmorni:fisch/${f.id}`);
    });
    expect(ANGEL_FISH.filter((f) => f.rarity === 'legendary')).toHaveLength(4);
    expect(ANGEL_BASE_ITEMS).toContain('cod');
  });

  it('gleich wie im Repo daneben (MM_CHECK_MODE_REPOS=1)', () => {
    if (process.env['MM_CHECK_MODE_REPOS'] !== '1' || !fs.existsSync(NEIGHBOUR)) return;
    const live = published();
    if (live === null) return; // noch nicht veröffentlicht
    expect(lines(live), `${NEIGHBOUR} hat andere Fisch-Modelle – Kopie nachziehen`).toEqual(EXPECTED);
  });
});
