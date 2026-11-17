/* eslint-disable ts-patterns/no-magic-numbers -- sheet music: keys, tempos and dynamics as the arrangement needs them */
import type { Song } from '../arrangement.js';

/**
 * Wiesn: zünftige Bierzelt-Musik – Polka, Schunkelwalzer, Einzugsmarsch und Schuhplattler. Alles eigene Melodien
 * (keine Wiesn-Hits, die noch geschützt sind).
 */

/** Zum Morni-Wirt – eigene Melodie: schnelle Polka mit Trio. */
export const ZUM_MORNI_WIRT: Song = {
  id: 'zum-morni-wirt',
  meter: '2/4',
  tpb: 8,
  transpose: 3,
  key: 0,
  style: 'polka',
  band: 'wiesn',
  parts: {
    I: { melody: "g''8 g'' g'' g'' | c'''4 r4 | g''8 g'' g'' g'' | b''4 r4", chords: 'C | C | G7 | G7' },
    A: {
      melody:
        "e''8 e'' e'' d''16 c'' | g''4 e''4 | d''8 d'' d'' c''16 b' | g''4 d''4 | e''8 f'' g'' a'' | g''8 e'' c'' e'' | d''8 f'' e'' d'' | c''4 r4",
      chords: 'C | C | G7 | G7 | C . . F | C | G7 | C',
    },
    A2: {
      melody:
        "e''8 e'' e'' d''16 c'' | g''4 e''4 | d''8 d'' d'' c''16 b' | g''4 d''4 | e''8 f'' g'' c''' | b''8 a'' g'' f'' | e''8 c'' d'' b' | c''4 r4",
      chords: 'C | C | G7 | G7 | C | G7 | C G7 | C',
    },
    B: {
      melody:
        "a'8 c'' f''4 | e''8 d'' c''4 | bes'8 d'' g''4 | e''8 f'' g''4 | a''8 g'' f'' e'' | d''8 e'' f'' d'' | c''8 bes' a' g' | f'4 r4",
      chords: 'F | C7 . F . | Gm | C7 | F | Bb | C7 | F',
    },
    B2: {
      melody:
        "a'8 c'' f''4 | e''8 d'' c''4 | bes'8 d'' g''4 | e''8 f'' g''4 | a''8 g'' f'' e'' | d''8 e'' f'' d'' | c''8 e'' g'' bes'' | a''4 r4",
      chords: 'F | C7 . F . | Gm | C7 | F | Bb | C7 | F',
    },
  },
  form: [
    { part: 'I', dyn: 0.85 },
    { part: 'A', dyn: 0.78 },
    { part: 'A2', dyn: 0.88, second: true },
    { part: 'B', dyn: 0.8, key: 5, second: true },
    { part: 'B2', dyn: 0.88, key: 5, second: true },
    { part: 'A', dyn: 0.9, second: true },
    { part: 'A2', dyn: 0.92, second: true },
    { part: 'B', dyn: 0.85, key: 5, second: true, perc: 'klatschen' },
    { part: 'B2', dyn: 0.92, key: 5, second: true, perc: 'klatschen' },
    { part: 'A', dyn: 0.95, second: true },
    { part: 'A2', dyn: 1, second: true },
  ],
  ending: 'kurz',
};

/** Maßkrug-Walzer – eigene Melodie: Schunkelwalzer fürs Bierzelt. */
export const MASSKRUG_WALZER: Song = {
  id: 'masskrug-walzer',
  meter: '3/4',
  tpb: 8,
  transpose: -2,
  key: 0,
  style: 'walzer',
  band: 'wiesn',
  parts: {
    I: { melody: 'r2. | r2. | r2. | r2.', chords: 'C | F | G7 | C' },
    A: {
      melody:
        "c''4 e'' g'' | g''2 e''4 | f''4 d'' b' | d''2. | b'4 d'' f'' | f''2 d''4 | e''4 c'' g' | c''2. | c''4 e'' g'' | c'''2 a''4 | a''4 g'' f'' | f''2 d''4 | e''4 g'' c''' | b''4 a'' g'' | f''4 e'' d'' | c''2.",
      chords: 'C | C | G7 | G7 | G7 | G7 | C | C | C | F | F | Dm | C | G7 | G7 | C',
    },
    B: {
      melody:
        "a'2 a'4 | c''2 c''4 | f''2. | e''4 d'' c'' | g'2 g'4 | b'2 b'4 | d''2. | c''4 d'' e'' | a'2 a'4 | c''2 c''4 | f''2. | a''4 g'' f'' | e''2 c''4 | d''2 b'4 | e''4 d'' b' | c''2.",
      chords: 'F | F | F | C | C | G7 | G7 | C | F | F | F | F | C | G7 | C G7 . | C',
    },
  },
  form: [
    { part: 'I', dyn: 0.75, noLead: true },
    { part: 'A', dyn: 0.78 },
    { part: 'B', dyn: 0.82, second: true },
    { part: 'A', dyn: 0.9, second: true },
    { part: 'B', dyn: 0.95, second: true, pad: true },
  ],
};

/** Wiesn-Einzug – eigene Melodie: Marsch im Sechsachteltakt, wie beim Einzug der Wirte. */
export const WIESN_EINZUG: Song = {
  id: 'wiesn-einzug',
  meter: '6/8',
  tpb: 8,
  transpose: 3,
  key: 0,
  style: 'marsch',
  band: 'wiesn',
  parts: {
    I: { melody: 'r2. | r2.', chords: 'C | G7' },
    A: {
      melody:
        "g'8 | c''4 c''8 c''4 e''8 | g''4. e''4 c''8 | d''4 d''8 d''4 f''8 | a''4. g''4 g'8 | c''4 c''8 c''4 e''8 | g''4. e''4 g''8 | f''4 e''8 d''4 b'8 | c''4. r4",
      chords: 'C | C | Dm | Dm G7 | C | C | G7 | C',
    },
    B: {
      melody:
        "c''8 | f''4 f''8 f''4 e''8 | d''4. c''4 c''8 | b'4 b'8 b'4 c''8 | d''4. g'4 c''8 | f''4 f''8 f''4 a''8 | g''4. e''4 c''8 | d''4 g''8 f''4 d''8 | c''4. r4",
      chords: 'F | Dm F | G7 | G7 | F | C | G7 | C',
    },
    T: {
      melody:
        "c''8 | a''4. g''4 f''8 | c''4. a'4 c''8 | bes''4. a''4 g''8 | c''4. e''4 g''8 | bes''4 a''8 g''4 f''8 | a''4. f''4 d''8 | c''4 a'8 g'4 bes'8 | a'4. r4",
      chords: 'F | F | C7 | C7 | C7 F | F Bb | F C7 | F',
    },
  },
  form: [
    { part: 'I', dyn: 0.85, noLead: true },
    { part: 'A', dyn: 0.8 },
    { part: 'A', dyn: 0.88, second: true },
    { part: 'B', dyn: 0.85, second: true },
    { part: 'A', dyn: 0.9, second: true },
    { part: 'T', dyn: 0.75, key: 5, second: true },
    { part: 'T', dyn: 0.92, key: 5, second: true },
    { part: 'A', dyn: 1, second: true },
  ],
};

/** Schuhplattler – eigene Melodie: Ländler mit Klatschen auf zwei und drei. */
export const SCHUHPLATTLER: Song = {
  id: 'schuhplattler',
  meter: '3/4',
  tpb: 8,
  transpose: 0,
  key: 7,
  style: 'walzer',
  band: 'wiesn',
  parts: {
    I: { melody: 'r2. | r2.', chords: 'G | D7' },
    A: {
      melody:
        "d''4 g'' g'' | fis''8 e'' d''4 b' | c''4 e'' e'' | d''8 c'' b'4 g' | a'4 c'' fis'' | a''8 g'' fis''4 d'' | c''8 b' a'4 fis' | g'2.",
      chords: 'G | G | C | G | D7 | D7 | D7 | G',
    },
    A2: {
      melody:
        "d''4 g'' g'' | fis''8 e'' d''4 b' | c''4 e'' e'' | d''8 c'' b'4 g' | a'4 c'' fis'' | a''8 g'' fis''4 d'' | d''8 c'' b'4 a' | g'2.",
      chords: 'G | G | C | G | D7 | D7 | G . D7 | G',
    },
    B: {
      melody:
        "b'4 d''8 b' g'4 | b'4 d''8 b' g'4 | c''4 e''8 c'' a'4 | d''4 fis''8 d'' a'4 | b'4 d''8 g'' b''4 | a''4 fis''8 d'' c''4 | b'4 a' fis' | g'2.",
      chords: 'G | G | Am | D7 | G | D7 | G D7 . | G',
    },
  },
  form: [
    { part: 'I', dyn: 0.8, noLead: true },
    { part: 'A', dyn: 0.8 },
    { part: 'A2', dyn: 0.85, perc: 'klatschen' },
    { part: 'B', dyn: 0.85, second: true, perc: 'klatschen' },
    { part: 'B', dyn: 0.9, second: true, perc: 'klatschen' },
    { part: 'A', dyn: 0.88, second: true },
    { part: 'A2', dyn: 0.95, second: true, perc: 'klatschen' },
  ],
};

export const WIESN: readonly Song[] = [ZUM_MORNI_WIRT, MASSKRUG_WALZER, WIESN_EINZUG, SCHUHPLATTLER];
