/* eslint-disable ts-patterns/no-magic-numbers -- sheet music: keys, tempos and dynamics as the arrangement needs them */
import type { Song } from '../arrangement.js';

/**
 * Winter und Weihnachten: alte Weihnachtslieder ohne Urheberrecht (Melodien aus dem 18. und 19. Jahrhundert oder
 * Volksweisen) und eine eigene Schlittenfahrt – mal leise mit Glocken, mal als Turmblasen der Blaskapelle.
 */

/** Stille Nacht, heilige Nacht – Franz Xaver Gruber (1818), gemeinfrei. */
export const STILLE_NACHT: Song = {
  id: 'stille-nacht',
  meter: '6/8',
  tpb: 16,
  transpose: 0,
  key: 0,
  style: 'wiege',
  band: 'glocken',
  parts: {
    A: {
      melody:
        "g'8. a'16 g'8 e'4. | g'8. a'16 g'8 e'4. | d''4 d''8 b'4. | c''4 c''8 g'4. | a'4 a'8 c''8. b'16 a'8 | g'8. a'16 g'8 e'4. | a'4 a'8 c''8. b'16 a'8 | g'8. a'16 g'8 e'4. | d''4 d''8 f''8. d''16 b'8 | c''4. e''4. | c''8. g'16 e'8 g'8. f'16 d'8 | c'2.",
      chords: 'C | C | G7 | C | F | C | F | C | G7 | C | C G7 | C',
    },
  },
  form: [
    { part: 'A', dyn: 0.6 },
    { part: 'A', style: 'choral', band: 'turm', dyn: 0.72, second: true },
    { part: 'A', dyn: 0.66, octave: 1, pad: true },
  ],
};

/** O Tannenbaum – Volksweise, gemeinfrei. */
export const O_TANNENBAUM: Song = {
  id: 'o-tannenbaum',
  meter: '3/4',
  tpb: 11,
  transpose: -2,
  key: 7,
  style: 'lied',
  band: 'glocken',
  parts: {
    I: { melody: 'r2. | r2.', chords: 'G | D7' },
    A: {
      melody: "d'8 | g'8. g'16 g'4 a' | b'8. b'16 b'4. b'8 | a'8 b' c''4 fis' | a'4 g' r8",
      chords: 'G . D | G | Am . D7 | D7 G .',
    },
    B: {
      melody: "d''8 | d''8 b' e''4. d''8 | d''8 c'' c''4. c''8 | c''8 a' d''4. c''8 | c''8 b' b'4 r8",
      chords: 'G7 C . | D7 | D7 | G',
    },
  },
  form: [
    { part: 'I', dyn: 0.6, noLead: true, arp: true },
    { part: 'A', dyn: 0.62, arp: true },
    { part: 'B', dyn: 0.62, arp: true },
    { part: 'A', dyn: 0.62, arp: true },
    { part: 'A', style: 'choral', band: 'turm', dyn: 0.72, second: true },
    { part: 'B', style: 'choral', band: 'turm', dyn: 0.72, second: true },
    { part: 'A', style: 'choral', band: 'turm', dyn: 0.72, second: true },
    { part: 'A', dyn: 0.7, octave: 1, pad: true, perc: 'triangel' },
    { part: 'B', dyn: 0.7, octave: 1, pad: true, perc: 'triangel' },
    { part: 'A', dyn: 0.7, octave: 1, pad: true, perc: 'triangel' },
  ],
};

/** Leise rieselt der Schnee – Eduard Ebel (1895), gemeinfrei. */
export const LEISE_RIESELT: Song = {
  id: 'leise-rieselt',
  meter: '6/8',
  tpb: 12,
  transpose: 0,
  key: 7,
  style: 'wiege',
  band: 'glocken',
  parts: {
    I: { melody: 'r2. | r2.', chords: 'G | D7' },
    A: {
      melody:
        "b'4 b'8 a' b' a' | g'4.~ g'4 r8 | g'4 e'8 g' fis' e' | d'4.~ d'4 r8 | a'8 gis' a' c'' b' a' | g'4.~ g'4 r8 | a'8. e'16 e'8 fis' e' fis' | g'4.~ g'4 r8",
      chords: 'G | G | C D7 | D | D7 | G | Am D7 | G',
    },
  },
  form: [
    { part: 'I', dyn: 0.55, noLead: true },
    { part: 'A', dyn: 0.58 },
    { part: 'A', dyn: 0.62, second: true },
    { part: 'A', style: 'choral', band: 'turm', dyn: 0.68, second: true },
    { part: 'A', dyn: 0.62, octave: 1, pad: true },
  ],
};

/** Alle Jahre wieder – Friedrich Silcher (1842), gemeinfrei. */
export const ALLE_JAHRE: Song = {
  id: 'alle-jahre',
  meter: '4/4',
  tpb: 12,
  transpose: 0,
  key: 2,
  style: 'lied',
  band: 'glocken',
  parts: {
    A: {
      melody:
        "a'4. b'8 a'4 g' | fis'2 e' | d'4 e'8 fis' g'4 fis' | e'2. r4 | fis'4 a' b' a' | d''2 cis''4 b' | a'4 g'8 fis' g'4 a' | fis'2. r4",
      chords: 'D . . A7 | D A | D . G D | A | D . G D | D . A G | D . A7 . | D',
    },
  },
  form: [
    { part: 'A', dyn: 0.6, arp: true },
    { part: 'A', dyn: 0.66, second: true, arp: true },
    { part: 'A', style: 'choral', band: 'turm', dyn: 0.72, second: true },
    { part: 'A', dyn: 0.66, octave: 1, pad: true, perc: 'triangel' },
  ],
};

/** O du fröhliche – sizilianische Volksweise (18. Jahrhundert), gemeinfrei – feierlich. */
export const O_DU_FROEHLICHE: Song = {
  id: 'o-du-froehliche',
  meter: '4/4',
  tpb: 9,
  transpose: -2,
  key: 0,
  style: 'choral',
  band: 'turm',
  parts: {
    A: {
      melody:
        "g'2 a' | g'4. f'8 e'4 f' | g'2 a' | g'4. f'8 e'4 f' | g'2 g' | a'2 b'4 c'' | b'2 a' | g'1 | d'4. e'8 d'4 e' | f'4. g'8 f'2 | e'4. f'8 e'4 f' | g'4. a'8 g'2 | c''4 b' a' g' | c''4 a' g' f' | e'2 d' | c'1",
      chords:
        'C F | C . . G7 | C F | C . . G7 | C | F . G7 C | G7 D7 | G | G7 | G7 | C | C | C G F C | F . C Dm | C G7 | C',
    },
  },
  form: [
    { part: 'A', dyn: 0.66, second: true },
    { part: 'A', style: 'lied', band: 'glocken', dyn: 0.6, arp: true },
    { part: 'A', dyn: 0.8, second: true, perc: 'triangel' },
  ],
};

/** Ihr Kinderlein, kommet – Johann Abraham Peter Schulz (1794), gemeinfrei. */
export const IHR_KINDERLEIN: Song = {
  id: 'ihr-kinderlein',
  meter: '2/4',
  tpb: 12,
  transpose: 0,
  key: 2,
  style: 'lied',
  band: 'glocken',
  parts: {
    A: {
      melody:
        "a'8 | a'4 fis'8 a' | a'4 fis'8 a' | g'4 e'8 g' | fis'4 r8 a'8 | a'4 fis'8 a' | a'4 fis'8 a' | g'4 e'8 g' | fis'4 r8 fis' | e'4 e'8 e' | g'4 g'8 g' | fis'4 fis'8 fis' | b'4 r8 b' | a'4 a'8 a'8 | d''4 a'8 fis' | g'4 e'8 cis' | d'4.",
      chords: 'D | D | A7 | D | D | D | A7 | D | A | A7 | D | G | D | D | A7 | D',
    },
  },
  form: [
    { part: 'A', dyn: 0.6, arp: true },
    { part: 'A', dyn: 0.66, second: true, perc: 'schellen' },
    { part: 'A', style: 'choral', band: 'turm', dyn: 0.7, second: true },
    { part: 'A', dyn: 0.66, octave: 1, pad: true, perc: 'schellen' },
  ],
};

/** Kling, Glöckchen, klingelingeling – Volksweise (19. Jahrhundert), gemeinfrei. */
export const KLING_GLOECKCHEN: Song = {
  id: 'kling-gloeckchen',
  meter: '2/4',
  tpb: 12,
  transpose: 0,
  key: 5,
  style: 'lied',
  band: 'glocken',
  parts: {
    A: {
      melody:
        "c''4 a'8 bes' | c''16 d'' c'' d'' c''4 | bes'4 g'8 c''8 | a'2 | g'8 g' a' f' | a'4 g' | bes'8 bes' c'' g' | bes'4 a' | g'8 g' a' b' | c''4 g' | a'8 d'' c'' b' | d''4 c'' | c''4 a'8 bes' | c''16 d'' c'' d'' c''4 | bes'4 g'8 c''8 | a'2",
      chords: 'F | F | C7 | F | C7 F | F C7 | C7 | C7 F | C G7 | C | Dm G7 | G7 C7 | F | F | C7 | F',
    },
  },
  form: [
    { part: 'A', dyn: 0.6, perc: 'schellen' },
    { part: 'A', dyn: 0.66, second: true, arp: true },
    { part: 'A', style: 'choral', band: 'turm', dyn: 0.7, second: true },
    { part: 'A', dyn: 0.68, octave: 1, second: true, perc: 'schellen' },
  ],
};

/** Schlittenfahrt – eigene Melodie: Walzer mit Schlittenschellen. */
export const SCHLITTENFAHRT: Song = {
  id: 'schlittenfahrt',
  meter: '3/4',
  tpb: 8,
  transpose: 0,
  key: 0,
  style: 'walzer',
  band: 'glocken',
  parts: {
    I: { melody: 'r2. | r2. | r2. | r2.', chords: 'C | Am | F | G7' },
    A: {
      melody:
        "e''2 g''4 | e''2 c''4 | d''2 f''4 | d''2 b'4 | c''4 d'' e'' | a''2 g''4 | f''4 e'' d'' | c''2. | e''2 g''4 | c'''2 b''4 | a''2 f''4 | e''2 c''4 | d''4 e'' f'' | g''2 b'4 | d''4 c'' b' | c''2.",
      chords: 'C | C | G7 | G7 | C | F . C | G7 | C | C | Am . G | F | C | Dm | G7 | G7 | C',
    },
    B: {
      melody:
        "a'4 c'' e'' | a''2 e''4 | d''4 f'' a'' | g''2 f''4 | e''4 g'' b'' | a''2 g''4 | f''4 e'' d'' | c''2.",
      chords: 'Am | Am | Dm | G7 | Em | Am . C | Dm . G7 | C',
    },
  },
  form: [
    { part: 'I', dyn: 0.6, noLead: true, perc: 'schellen' },
    { part: 'A', dyn: 0.62, perc: 'schellen' },
    { part: 'B', dyn: 0.62, arp: true, perc: 'schellen' },
    { part: 'A', dyn: 0.7, second: true, perc: 'schellen' },
    { part: 'B', dyn: 0.68, second: true, arp: true, perc: 'schellen' },
    { part: 'A', dyn: 0.74, second: true, pad: true, perc: 'schellen' },
  ],
};

export const WINTER: readonly Song[] = [
  STILLE_NACHT,
  O_TANNENBAUM,
  LEISE_RIESELT,
  ALLE_JAHRE,
  O_DU_FROEHLICHE,
  IHR_KINDERLEIN,
  KLING_GLOECKCHEN,
  SCHLITTENFAHRT,
];
