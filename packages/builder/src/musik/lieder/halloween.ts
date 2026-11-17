/* eslint-disable ts-patterns/no-magic-numbers -- sheet music: keys, tempos and dynamics as the arrangement needs them */
import type { Song } from '../arrangement.js';

/** Halloween: Griegs Halle des Bergkönigs (gemeinfrei) und zwei eigene Gruselstücke in Moll. */

/** In der Halle des Bergkönigs – Edvard Grieg (Peer Gynt, 1875), gemeinfrei: wird immer schneller und lauter. */
export const BERGKOENIG: Song = {
  id: 'bergkoenig',
  meter: '4/4',
  tpb: 10,
  transpose: 2,
  key: 9,
  minor: true,
  style: 'spuk',
  band: 'spuk',
  parts: {
    A: {
      melody: "a8 b c' d' e' c' e'4 | dis'8 b dis'4 d'8 bes d'4 | a8 b c' d' e' c' e' a' | g'8 e' c' e' g'2",
      chords: 'Am | Am | Am | C',
    },
    B: {
      melody:
        "e'8 fis' gis' a' b' gis' b'4 | c''8 gis' c''4 b'8 gis' b'4 | e'8 fis' gis' a' b' gis' b'4 | c''8 gis' c''4 b'4 r4",
      chords: 'E | E | E | E',
    },
  },
  form: [
    { part: 'A', dyn: 0.5 },
    { part: 'A', dyn: 0.55 },
    { part: 'B', dyn: 0.58 },
    { part: 'B', dyn: 0.6 },
    { part: 'A', dyn: 0.66, octave: 1, tpb: 8 },
    { part: 'B', dyn: 0.7, octave: 1, pad: true },
    { part: 'A', dyn: 0.8, octave: 1, tpb: 7, second: true, pad: true },
    { part: 'B', dyn: 0.85, octave: 1, second: true, pad: true },
    { part: 'A', dyn: 0.95, octave: 1, tpb: 6, second: true, pad: true, band: 'geister' },
    { part: 'A', dyn: 1, octave: 1, second: true, pad: true, band: 'geister' },
  ],
  ending: 'kurz',
};

/** Geisterwalzer – eigene Melodie: Walzer in a-Moll mit klappernden Knochen (Xylophon). */
export const GEISTERWALZER: Song = {
  id: 'geisterwalzer',
  meter: '3/4',
  tpb: 8,
  transpose: 0,
  key: 9,
  minor: true,
  style: 'walzer',
  band: 'geister',
  parts: {
    I: { melody: 'r2. | r2. | r2. | r2.', chords: 'Am | E7 | Am | E7' },
    A: {
      melody:
        "a'4 c'' e'' | a''2 gis''4 | a''4 e'' c'' | a'2. | d''4 f'' a'' | d'''2 cis'''4 | d'''4 a'' f'' | d''2. | b'4 d'' f'' | e''2 gis''4 | a''4 c''' e''' | d'''2 c'''4 | b''4 a'' gis'' | f''2 e''4 | b'4 c'' d'' | a'2.",
      chords:
        'Am | Am . E7 | Am | Am | Dm | Dm . A7 | Dm | Dm | Bdim | E7 | Am | Dm . Am | E7 | Dm . E7 | E7 | Am',
    },
    B: {
      melody:
        "g''4 e'' c'' | g'2 c''4 | a''4 f'' d'' | a'2 d''4 | b'4 d'' f'' | g''2 f''4 | e''4 d'' c'' | c''2 e''4",
      chords: 'C | C | Dm | Dm | G7 | G7 | C G7 C | C . E7',
    },
  },
  form: [
    { part: 'I', dyn: 0.6, noLead: true },
    { part: 'A', dyn: 0.62 },
    { part: 'B', dyn: 0.62, key: 0, minor: false, arp: true },
    { part: 'A', dyn: 0.7, second: true },
    { part: 'B', dyn: 0.7, key: 0, minor: false, second: true, band: 'spuk' },
    { part: 'A', dyn: 0.76, second: true, pad: true },
  ],
};

/** Kürbis-Polka – eigene Melodie: Polka in d-Moll mit Fagott und Cembalo. */
export const KUERBIS_POLKA: Song = {
  id: 'kuerbis-polka',
  meter: '2/4',
  tpb: 10,
  transpose: 0,
  key: 2,
  minor: true,
  style: 'polka',
  band: 'spuk',
  parts: {
    I: { melody: 'r2 | r2 | r2 | r2', chords: 'Dm | A7 | Dm | A7' },
    A: {
      melody:
        "d''8 a' d'' f'' | e''8 d'' cis''4 | e''8 cis'' e'' g'' | f''8 e'' d''4 | a''8 g'' f'' e'' | d''8 bes' g' bes' | a'8 cis'' e'' g'' | d''4 r4",
      chords: 'Dm | Dm A7 | A7 | A7 Dm | Dm . . A7 | Gm | A7 | Dm',
    },
    A2: {
      melody:
        "d''8 a' d'' f'' | e''8 d'' cis''4 | e''8 cis'' e'' g'' | f''8 e'' d''4 | a''8 g'' f'' e'' | d''8 bes' g' bes' | e''8 cis'' a' cis'' | d''4 r4",
      chords: 'Dm | Dm A7 | A7 | A7 Dm | Dm . . A7 | Gm | A7 | Dm',
    },
    B: {
      melody:
        "c''8 f'' a'' f'' | c''8 a' f'4 | bes'8 d'' g'' d'' | bes'8 g' e'4 | a'8 c'' f'' a'' | g''8 f'' e'' d'' | cis''8 e'' a'' g'' | f''8 e'' d''4",
      chords: 'F | F | Gm | C7 | F | C7 | A7 | A7 . Dm .',
    },
  },
  form: [
    { part: 'I', dyn: 0.66, noLead: true },
    { part: 'A', dyn: 0.66 },
    { part: 'A2', dyn: 0.72, second: true },
    { part: 'B', dyn: 0.7, key: 5, minor: false, band: 'geister' },
    { part: 'B', dyn: 0.75, key: 5, minor: false, second: true },
    { part: 'A', dyn: 0.78, second: true },
    { part: 'A2', dyn: 0.82, second: true, pad: true },
    { part: 'B', dyn: 0.8, key: 5, minor: false, second: true, band: 'geister' },
  ],
  ending: 'kurz',
};

export const HALLOWEEN: readonly Song[] = [BERGKOENIG, GEISTERWALZER, KUERBIS_POLKA];
