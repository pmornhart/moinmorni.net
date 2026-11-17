/* eslint-disable ts-patterns/no-magic-numbers -- sheet music: keys, tempos and dynamics as the arrangement needs them */
import type { Song } from '../arrangement.js';

/**
 * Alltag in der Lobby: gemütliche Blasmusik und Stubenmusik. Alle Melodien sind selbst geschrieben oder alte
 * Volksweisen ohne Urheberrecht (steht bei jedem Lied).
 */

/** MoinMorni-Marsch – das MoinMorni-Thema (eigene Melodie, auch in den Trailern) mit Trio. */
export const MORNI_MARSCH: Song = {
  id: 'morni-marsch',
  meter: '4/4',
  tpb: 10,
  transpose: -2,
  key: 0,
  style: 'marsch',
  band: 'blaskapelle',
  parts: {
    I: { melody: "g'8 g' g' g' c''4 e'' | d''2 g'2", chords: 'C | G7' },
    A: {
      melody:
        "g'4 e'8 f' g'4 c'' | b'4 a'8 g' a'2 | f'4 d'8 e' f'4 a' | g'2. r4 | g'4 e'8 f' g'4 c'' | d''4 c''8 b' a'4 f' | e'4 g' d' b | c'2. r4",
      chords: 'C | G Am | F | G | C | Dm | C G7 | C',
    },
    B: {
      melody:
        "e''4. d''8 c''4 a' | g'4. a'8 g'4 e' | f'4 a' c'' f'' | e''2 d'' | e''4. d''8 c''4 a' | g'4 c'' e'' g'' | f''4 e''8 d'' c''4 b' | c''2. r4",
      chords: 'Am | C | F | C G | Am | C | F . C G7 | C',
    },
    T: {
      melody:
        "a'2 c''4 a' | g'2 f'4 g' | a'4 bes' c'' d'' | c''2. r4 | a'2 c''4 a' | g'4 a' bes' g' | f'4 a' g' e' | f'2. r4",
      chords: 'F | C7 . F C7 | F . C7 Bb | F | F | C7 | F C7 | F',
    },
  },
  form: [
    { part: 'I', dyn: 0.85 },
    { part: 'A', dyn: 0.7 },
    { part: 'A', dyn: 0.88, second: true },
    { part: 'B', dyn: 0.85, second: true },
    { part: 'T', dyn: 0.68, key: 5, second: true, drums: false },
    { part: 'T', dyn: 0.9, key: 5, second: true },
    { part: 'A', dyn: 0.95, second: true },
  ],
};

/** Dorfplatz-Polka – eigene Melodie: Polka mit Trio in der Unterdominante. */
export const DORFPLATZ_POLKA: Song = {
  id: 'dorfplatz-polka',
  meter: '2/4',
  tpb: 10,
  transpose: -2,
  key: 0,
  style: 'polka',
  band: 'blaskapelle',
  parts: {
    I: { melody: "c''8 c'' c'' c'' | g'4 r | b'8 b' b' b' | g'4 r", chords: 'C | C | G7 | G7' },
    A: {
      melody:
        "g'8 c'' e'' c'' | g'4 r8 g'16 a' | b'8 d'' f'' d'' | b'4 r8 b'16 c'' | d''8 f'' a'' f'' | e''8 g'' e'' c'' | d''8 c'' b' d'' | c''4 r4",
      chords: 'C | C | G7 | G7 | Dm | C | G7 | C',
    },
    A2: {
      melody:
        "g'8 c'' e'' c'' | g'4 r8 g'16 a' | b'8 d'' f'' d'' | b'4 r8 b'16 c'' | d''8 f'' a'' f'' | e''8 c'' a' c'' | g'8 b' d'' b' | c''4 r4",
      chords: 'C | C | G7 | G7 | Dm | Am | G7 | C',
    },
    B: {
      melody:
        "e''8. d''16 c''8 e'' | d''4 b' | c''8. b'16 a'8 c'' | b'4 g' | a'8 b' c'' d'' | e''8 f'' g''4 | f''8 e'' d'' c'' | b'4 g'4",
      chords: 'C | G | Am | G | F | C | Dm G7 | G7',
    },
    B2: {
      melody:
        "e''8. d''16 c''8 e'' | d''4 b' | c''8. b'16 a'8 c'' | b'4 g' | a'8 c'' f'' a'' | g''8 e'' c''4 | d''8 b' g' b' | c''4 r4",
      chords: 'C | G | Am | G | F | C | G7 | C',
    },
    T: {
      melody:
        "a'4. bes'8 | c''4 a' | g'4. a'8 | bes'4 g' | e'8 f' g' a' | bes'8 a' g' bes' | a'4 g' | f'4 r4",
      chords: 'F | F | C7 | C7 | C7 | C7 | F C7 | F',
    },
    T2: {
      melody:
        "a'4. bes'8 | c''4 f'' | e''4. d''8 | c''4 bes' | a'8 bes' c'' d'' | d''8 bes' f'' d'' | c''4 e' | f'4 r4",
      chords: 'F | F | C7 | C7 | F . . Bb | Bb | F C7 | F',
    },
  },
  form: [
    { part: 'I', dyn: 0.8 },
    { part: 'A', dyn: 0.72 },
    { part: 'A2', dyn: 0.85, second: true },
    { part: 'B', dyn: 0.8, second: true },
    { part: 'B2', dyn: 0.85, second: true },
    { part: 'T', dyn: 0.66, key: 5, second: true, drums: false },
    { part: 'T2', dyn: 0.85, key: 5, second: true },
    { part: 'A', dyn: 0.9, second: true },
    { part: 'A2', dyn: 0.95, second: true },
  ],
  ending: 'kurz',
};

/** Almrausch-Walzer – eigene Melodie: Walzer der Blaskapelle. */
export const ALMRAUSCH_WALZER: Song = {
  id: 'almrausch-walzer',
  meter: '3/4',
  tpb: 8,
  transpose: -2,
  key: 0,
  style: 'walzer',
  band: 'blaskapelle',
  parts: {
    I: { melody: 'r2. | r2. | r2. | r2.', chords: 'C | G7 | C | G7' },
    A: {
      melody:
        "g'2 c''4 | e''2. | d''2 b'4 | g'2. | a'2 c''4 | f''2. | e''2 d''4 | c''2. | e''2 g''4 | g''4 f'' e'' | d''2 f''4 | f''4 e'' d'' | c''4 e'' a'' | g''2 e''4 | d''4 e'' d'' | c''2.",
      chords: 'C | C | G7 | G7 | F | F | C . G7 | C | C | C | G7 | G7 | Am | C | G7 | C',
    },
    B: {
      melody:
        "b'4 c'' d'' | d''2 g'4 | c''4 d'' e'' | e''2 c''4 | a'4 b' c'' | c''2 a'4 | c''4 a' fis' | d'2. | b'4 c'' d'' | g''2 d''4 | e''4 d'' c'' | c''2 e''4 | a'4 c'' e'' | d''4 c'' a' | b'2 a'4 | g'2.",
      chords: 'G | G | C | C | Am | Am | D7 | D7 | G | G | C | C | Am | D7 | G . D7 | G . G7',
    },
  },
  form: [
    { part: 'I', dyn: 0.7, noLead: true },
    { part: 'A', dyn: 0.72 },
    { part: 'B', dyn: 0.78, key: 7, second: true },
    { part: 'B', dyn: 0.85, key: 7, second: true, arp: true },
    { part: 'A', dyn: 0.92, second: true },
  ],
};

/** Morni-Ländler – eigene Melodie: Stubenmusik mit Klarinette, Hackbrett, Gitarre und Harfe. */
export const MORNI_LAENDLER: Song = {
  id: 'morni-laendler',
  meter: '3/4',
  tpb: 10,
  transpose: 0,
  key: 7,
  style: 'laendler',
  band: 'alpen',
  parts: {
    I: { melody: 'r2. | r2.', chords: 'G | D7' },
    A: {
      melody:
        "d''8 b' g'4 b' | d''8 b' g'4 r4 | c''8 a' fis'4 a' | c''8 a' fis'4 r4 | b'8 d'' g''4 fis''8 e'' | d''4 c'' b' | a'8 b' c''4 fis' | g'2 r4",
      chords: 'G | G | D7 | D7 | G | D7 . G | D7 | G',
    },
    A2: {
      melody:
        "d''8 b' g'4 b' | d''8 b' g'4 r4 | c''8 a' fis'4 a' | c''8 a' fis'4 r4 | b'8 d'' g''4 fis''8 e'' | d''4 c'' b' | a'8 c'' b'4 a' | g'2.",
      chords: 'G | G | D7 | D7 | G | D7 . G | G . D7 | G',
    },
    B: {
      melody:
        "g'4 e'' d'' | c''4 e'' g'' | fis''4 e'' d'' | d''2 c''4 | b'4 d'' g'' | g''4 fis'' e'' | d''4 c'' a' | g'2.",
      chords: 'C | C | D7 | D7 | G | Em | D7 | G',
    },
  },
  form: [
    { part: 'I', dyn: 0.7, noLead: true, arp: true },
    { part: 'A', dyn: 0.72 },
    { part: 'A2', dyn: 0.78, arp: true },
    { part: 'B', dyn: 0.75, second: true },
    { part: 'A2', dyn: 0.8, second: true },
    { part: 'B', dyn: 0.8, second: true, arp: true },
    { part: 'A2', dyn: 0.85, second: true, arp: true },
  ],
};

/** Das Wandern ist des Müllers Lust – Melodie Carl Friedrich Zöllner (1844), gemeinfrei. */
export const MUELLERS_LUST: Song = {
  id: 'muellers-lust',
  meter: '2/4',
  tpb: 10,
  transpose: 0,
  key: 10,
  style: 'marsch',
  band: 'blaskapelle',
  parts: {
    A: {
      melody:
        "f'8 | bes'8. f'16 d'8 ees' | f'8. g'16 f'8 bes' | d''8. f'16 bes'8 c'' | d''8. ees''16 d''8 bes' | d''4 c'' | bes'4 r4 | r4 r8 f'8 | c''8 c'' d''16 c'' b' c'' | a'8 c'' f' f' | c''8 c'' d''16 c'' b' c'' | a'8 c'' f' f' | g'8 a' bes' c'' | d''8. c''16 bes'8 d'' | f''4 f'8 r8 | f''4 f'8 r8 | f'4 f''~ | f''8 e''16 f'' d''8 bes' | f'4 f''~ | f''8 e''16 f'' d''8 bes' | a'8 c'' f' a' | bes'8 f' bes' d'' | f''4 a' | bes'4 r8",
      chords:
        'Bb | Bb | Bb | Bb | Bb F7 | Bb | Bb | F | F | F | F | Eb | Bb Gm | F | F7 | Bb/F | Bb/F | Bb/F | Bb/F | F7 | Bb | Bb F7 | Bb',
    },
  },
  form: [
    { part: 'A', dyn: 0.72 },
    { part: 'A', dyn: 0.82, second: true },
    { part: 'A', dyn: 0.92, second: true },
  ],
};

/** Ein Jäger aus Kurpfalz – Volksweise (18. Jahrhundert), gemeinfrei – mit Jagdhörnern. */
export const JAEGER_KURPFALZ: Song = {
  id: 'jaeger-kurpfalz',
  meter: '2/4',
  tpb: 10,
  transpose: 0,
  key: 5,
  style: 'marsch',
  band: 'blaskapelle',
  parts: {
    A: {
      melody:
        "c'8 | f'8 a' a' a' | a'4. c''8 | c''8 bes' bes' a' | a'8 g' g' f' | e'8 g' g' g' | g'4 c''4 | a'8 a' g' g' | f'4. a'8 | c''4. bes'8 | a'4. c''8 | f''8 c'' c'' a' | a'8 g' g' f' | e'8 g' g' g' | g'4 c''4 | a'8 a' g' g' | f'4 r8",
      chords: 'F | F | C7 F | F C7 | C7 | C7 | F C7 | F | F C7 | F | F | F C7 | C7 | C7 | F C7 | F',
    },
  },
  form: [
    { part: 'A', dyn: 0.7 },
    { part: 'A', dyn: 0.8, second: true },
    { part: 'A', dyn: 0.72, style: 'polka', drums: false, arp: true },
    { part: 'A', dyn: 0.92, second: true },
  ],
};

export const ALLTAG: readonly Song[] = [
  MORNI_MARSCH,
  DORFPLATZ_POLKA,
  ALMRAUSCH_WALZER,
  MORNI_LAENDLER,
  MUELLERS_LUST,
  JAEGER_KURPFALZ,
];
