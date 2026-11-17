import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANGEL_CLOTHES, ANGEL_CLOTHING_NAMES, clothingModelName } from '../src/index.js';

/** „Name Gegenstand Platz“ je Stück, wie in der Liste von Angelkönig. */
const EXPECTED = ANGEL_CLOTHES.map((c) => `${clothingModelName(c.id)} ${c.base} ${c.slot}`);

/**
 * Die Modell-Namen der Kleidung stehen in zwei Repos: hier (`angel-kleidung.ts`) und in Angelkönig
 * (`ClothingModels.java`, Liste in `docs/kleidung-modelle.txt`). Die Kopie `angel-kleidung.txt` hält beide gleich; mit
 * `MM_CHECK_MODE_REPOS=1` wird zusätzlich mit dem Repo daneben verglichen (`origin/main`, sonst der Ordner).
 */
const HERE = import.meta.dirname;
const COPY = path.join(HERE, 'angel-kleidung.txt');
const NEIGHBOUR = path.resolve(HERE, '../../../..', 'morni-angelkoenig');
const LIST_IN_REPO = 'docs/kleidung-modelle.txt';

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

describe('Kleidung im Angelkönig', () => {
  it('Modell-Namen, Gegenstände und Plätze = Kopie der Liste aus Angelkönig', () => {
    expect(EXPECTED).toEqual(lines(fs.readFileSync(COPY, 'utf8')));
    expect(ANGEL_CLOTHING_NAMES).toEqual(EXPECTED.map((l) => l.split(' ')[0]));
  });

  it('jedes Stück einmal, Namen und Sätze in beiden Sprachen, nur die Krone ist nicht zu kaufen', () => {
    expect(new Set(ANGEL_CLOTHES.map((c) => c.id)).size).toBe(ANGEL_CLOTHES.length);
    ANGEL_CLOTHES.forEach((c) => {
      expect(c.de && c.en && c.noteDe && c.noteEn, c.id).toBeTruthy();
      expect(clothingModelName(c.id)).toBe(`moinmorni:kleidung/${c.id}`);
    });
    expect(ANGEL_CLOTHES.filter((c) => c.price === 0).map((c) => c.id)).toEqual(['koenigskrone']);
    expect(ANGEL_CLOTHES.filter((c) => c.slot === 'head')).toHaveLength(4);
  });

  it('gleich wie im Repo daneben (MM_CHECK_MODE_REPOS=1)', () => {
    if (process.env['MM_CHECK_MODE_REPOS'] !== '1' || !fs.existsSync(NEIGHBOUR)) return;
    const live = published();
    if (live === null) return; // noch nicht veröffentlicht
    expect(lines(live), `${NEIGHBOUR} hat andere Kleidungs-Modelle – Kopie nachziehen`).toEqual(EXPECTED);
  });
});
