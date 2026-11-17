/* eslint-disable ts-patterns/no-magic-numbers -- sheet music: keys, tempos and dynamics as the arrangement needs them */
import type { Song } from '../arrangement.js';

/** Ostern und Frühling: alte Frühlingslieder und Griegs Morgenstimmung – alles ohne Urheberrecht. */

/** Alle Vögel sind schon da – Volksweise, gemeinfrei. */
export const ALLE_VOEGEL: Song = {
  id: 'alle-voegel',
  meter: '4/4',
  tpb: 10,
  transpose: 0,
  key: 2,
  style: 'lied',
  band: 'fruehling',
  parts: {
    A: {
      melody:
        "d'4. fis'8 a'4 d'' | b'4 d''8 b' a'2 | g'4. a'8 fis'4 d' | e'2 d'4 r | a'4 a' g' g' | fis'4 a'8 fis' e'2 | a'4 a' g' g' | fis'4 a'8 fis' e'2 | d'4. fis'8 a'4 d'' | b'4 d''8 b' a'2 | g'4. a'8 fis'4 d' | e'2 d'4 r",
      chords:
        'D | G . D . | G . D . | A7 . D . | D . A7 . | D . A . | D . A7 . | D . A . | D | G . D . | G . D . | A7 . D .',
    },
  },
  form: [
    { part: 'A', dyn: 0.62, arp: true },
    { part: 'A', dyn: 0.7, second: true, perc: 'triangel' },
    { part: 'A', dyn: 0.66, band: 'morgen', octave: 1, pad: true },
  ],
};

/** Kuckuck, Kuckuck, ruft’s aus dem Wald – Volksweise, gemeinfrei. */
export const KUCKUCK: Song = {
  id: 'kuckuck',
  meter: '3/4',
  tpb: 9,
  transpose: 0,
  key: 7,
  style: 'walzer',
  band: 'fruehling',
  parts: {
    A: {
      melody:
        "d''4 b' r | d''4 b' r | a'4 g' a' | g'2. | a'4 a' b' | c''2 a'4 | b'4 b' c'' | d''2 b'4 | d''2 b'4 | d''2 b'4 | c''4 b' a' | g'2.",
      chords: 'G | G | D7 G D7 | G | D . G | Am . D7 | G . C | G | G | G | C G D7 | G',
    },
  },
  form: [
    { part: 'A', dyn: 0.62, drums: false },
    { part: 'A', dyn: 0.7, second: true },
    { part: 'A', dyn: 0.66, band: 'morgen', arp: true, drums: false },
    { part: 'A', dyn: 0.74, second: true, octave: 1, perc: 'triangel' },
  ],
};

/** Der Mai ist gekommen – Justus Wilhelm Lyra (1843), gemeinfrei. */
export const DER_MAI: Song = {
  id: 'der-mai',
  meter: '3/4',
  tpb: 10,
  transpose: 0,
  key: 2,
  style: 'lied',
  band: 'fruehling',
  parts: {
    A: {
      melody: "d'8 e' | fis'4 fis'4. g'8 | b'4 a'4. fis'8 | a'8. g'16 g'4 a'4 | fis'2",
      chords: 'D | Bm D . | A7 | D',
    },
    B: {
      melody:
        "fis'8. fis'16 | e'4 a'4. a'8 | gis'4 b'4. b'8 | e''8. d''16 cis''8. b'16 a'8. gis'16 | a'2 a'8 g'8 | fis'8. fis'16 fis'4. g'8 | b'4 a'4. fis'8 | a'8. g'16 g'4 a'4 | fis'2",
      chords: 'A | E | A . E7 | A . A7 | D | G D . | A7 | D',
    },
  },
  form: [
    { part: 'A', dyn: 0.62 },
    { part: 'A', dyn: 0.62 },
    { part: 'B', dyn: 0.66, second: true },
    { part: 'A', dyn: 0.68, style: 'walzer', drums: false, arp: true },
    { part: 'A', dyn: 0.68, style: 'walzer', drums: false, arp: true },
    { part: 'B', dyn: 0.72, style: 'walzer', drums: false, second: true, arp: true },
    { part: 'A', dyn: 0.72, band: 'morgen', octave: 1, pad: true },
    { part: 'B', dyn: 0.76, band: 'morgen', octave: 1, second: true, pad: true },
  ],
};

/** Morgenstimmung – Edvard Grieg (Peer Gynt, 1875), gemeinfrei: Flöte und Oboe im Wechsel. */
export const MORGENSTIMMUNG: Song = {
  id: 'morgenstimmung',
  meter: '6/8',
  tpb: 12,
  transpose: 0,
  key: 0,
  style: 'wiege',
  band: 'fruehling',
  parts: {
    A: {
      melody:
        "g''8 e'' d'' c'' d'' e'' | g''8 e'' d'' c'' d''16 e'' d'' e'' | g''8 e'' g'' a'' e'' a'' | g''8 e'' d'' c''4.",
      chords: 'C | C | C Am | C',
    },
  },
  form: [
    { part: 'A', dyn: 0.5 },
    { part: 'A', dyn: 0.5, band: 'morgen' },
    { part: 'A', dyn: 0.58, shift: 4 },
    { part: 'A', dyn: 0.58, band: 'morgen', shift: 4 },
    { part: 'A', dyn: 0.64, shift: 7 },
    { part: 'A', dyn: 0.66, band: 'morgen', shift: 7 },
    { part: 'A', dyn: 0.8, second: true, pad: true },
    { part: 'A', dyn: 0.85, band: 'morgen', second: true, pad: true },
    { part: 'A', dyn: 0.55, octave: -1 },
  ],
};

export const OSTERN: readonly Song[] = [ALLE_VOEGEL, KUCKUCK, DER_MAI, MORGENSTIMMUNG];
