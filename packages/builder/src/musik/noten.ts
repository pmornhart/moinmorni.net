/* eslint-disable ts-patterns/no-magic-numbers -- music theory tables: intervals, durations and bar lengths as notation has them */
/**
 * Noten für die Lobbymusik – kurz geschrieben wie in LilyPond (absolute Oktaven):
 *
 *   "g'8 e' f' g' | c''4. r8 | bes'2~ bes'8 r8 r4"
 *
 * - Ton: c d e f g a b, erhöht mit „is“ (fis), erniedrigt mit „es“ (bes, es, as). `c'` ist das eingestrichene C
 *   (MIDI 60), jedes `'` eine Oktave höher, jedes `,` eine tiefer; `c` allein ist C3.
 * - Dauer: 1 2 4 8 16 32, Punkte verlängern (4. = punktierte Viertel), `t` = Triole (8t = Achteltriole). Ohne Zahl
 *   gilt die vorige Dauer.
 * - `r` = Pause, `~` = an den nächsten (gleichen) Ton gebunden, `|` = Taktstrich (wird geprüft).
 *
 * Steht vor dem ersten Taktstrich weniger als ein Takt, ist das ein Auftakt; dann ist der letzte Takt um genau so viel
 * kürzer (wie in jedem Liederbuch). So lassen sich Teile aneinanderhängen und wiederholen.
 */

export type Meter = '2/4' | '3/4' | '4/4' | '6/8' | '2/2';

/** Länge eines Takts in Viertelnoten. */
export const BAR_BEATS: Readonly<Record<Meter, number>> = {
  '2/4': 2,
  '3/4': 3,
  '4/4': 4,
  '6/8': 3,
  '2/2': 4,
};

/** Schläge, auf die die Begleitung zählt (in Vierteln ab Taktanfang). */
export const PULSES: Readonly<Record<Meter, readonly number[]>> = {
  '2/4': [0, 1],
  '3/4': [0, 1, 2],
  '4/4': [0, 1, 2, 3],
  '6/8': [0, 1.5],
  '2/2': [0, 2],
};

export interface Note {
  /** Beginn in Vierteln ab dem ersten vollen Takt (Auftakt: negativ). */
  readonly at: number;
  /** Dauer in Vierteln. */
  readonly dur: number;
  /** MIDI-Tonhöhe (60 = c'). */
  readonly pitch: number;
}

export interface Phrase {
  readonly notes: readonly Note[];
  /** Länge des Auftakts in Vierteln (0 = keiner). */
  readonly pickup: number;
  /** Volle Takte (der Auftakt zählt mit dem verkürzten letzten Takt als einer). */
  readonly bars: number;
}

const EPSILON = 1e-6;
const C3 = 48;
const OCTAVE = 12;
const WHOLE = 4;
const DOT = 1.5;
const DOUBLE_DOT = 1.75;
const TRIPLET = 2 / 3;
const STEPS: Readonly<Record<string, number>> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const ACCIDENTALS: Readonly<Record<string, number>> = { '': 0, is: 1, isis: 2, es: -1, eses: -2, s: -1 };

// Ein Ton oder eine Pause: passt auf "fis''8.~", "bes4", "r16", "as'8t" – nicht auf "h4" oder "c64".
// https://regex101.com/?flavor=javascript&regex=%5E(%3F%3A(%5Ba-g%5D)(isis%7Ceses%7Cis%7Ces%7Cs)%3F(%5B%27%2C%5D*)%7C(r))(%3F%3A(1%7C2%7C4%7C8%7C16%7C32)(%5C.%7B0%2C2%7D)(t%3F))%3F(~)%3F%24&testString=fis%27%278.~
const TOKEN = /^(?:([a-g])(isis|eses|is|es|s)?([',]*)|(r))(?:(1|2|4|8|16|32)(\.{0,2})(t?))?(~)?$/;

interface Raw {
  readonly pitch: number | null;
  readonly dur: number;
  readonly tie: boolean;
}

function fail(src: string, why: string): never {
  throw new Error(`Noten „${src.slice(0, 60)}…“: ${why}`);
}

/** Punkte hinter der Dauer: keiner, einer, zwei. */
const DOTS: Readonly<Record<number, number>> = { 0: 1, 1: DOT, 2: DOUBLE_DOT };

function durationOf(value: string, dots: string, triplet: string): number {
  const dotted = (WHOLE / Number(value)) * (DOTS[dots.length] ?? 1);
  return triplet ? dotted * TRIPLET : dotted;
}

function same(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

/** Noten lesen und Takte prüfen. Wirft mit verständlicher Meldung, wenn ein Takt nicht aufgeht. */
export function phrase(src: string, meter: Meter): Phrase {
  const bar = BAR_BEATS[meter];
  const segments: Raw[][] = [[]];
  let last = 1;
  src
    .split(/\s+/)
    .filter(Boolean)
    .forEach((token) => {
      if (token === '|') {
        segments.push([]);
        return;
      }
      const m = TOKEN.exec(token);
      if (!m) fail(src, `„${token}“ ist kein Ton`);
      const [, name, acc = '', octaves = '', rest, value, dots = '', triplet = '', tie] = m;
      if (acc === 's' && name !== 'a' && name !== 'e') fail(src, `„${token}“: nur as und es gibt es so kurz`);
      if (value) last = durationOf(value, dots, triplet);
      const up = [...octaves].filter((o) => o === "'").length - [...octaves].filter((o) => o === ',').length;
      const pitch = rest || !name ? null : C3 + (STEPS[name] ?? 0) + (ACCIDENTALS[acc] ?? 0) + OCTAVE * up;
      segments[segments.length - 1]?.push({ pitch, dur: last, tie: Boolean(tie) });
    });
  // Ein Taktstrich am Ende lässt ein leeres Stück zurück.
  if (segments.length > 1 && segments[segments.length - 1]?.length === 0) segments.pop();
  const lengths = segments.map((s) => s.reduce((sum, n) => sum + n.dur, 0));
  const first = lengths[0] ?? 0;
  const pickup = segments.length > 1 && first < bar - EPSILON ? first : 0;
  lengths.forEach((len, i) => {
    const isFirst = i === 0;
    const isLast = i === lengths.length - 1 && lengths.length > 1;
    const shortened = pickup > 0 && (isFirst || isLast);
    const want = shortened ? (isFirst ? pickup : bar - pickup) : bar;
    if (!same(len, want)) fail(src, `Takt ${i + 1} hat ${len} statt ${want} Viertel (${meter})`);
  });
  const bars = pickup > 0 ? segments.length - 1 : segments.length;
  // Gebundene Töne zusammenfassen.
  const flat = segments.flat();
  const notes: Note[] = [];
  let time = -pickup;
  let open: { at: number; dur: number; pitch: number } | null = null;
  flat.forEach((n) => {
    if (open && n.pitch === open.pitch) {
      open.dur += n.dur;
    } else if (open) {
      fail(src, `Bindebogen von ${open.pitch} auf einen anderen Ton`);
    } else if (n.pitch !== null) {
      open = { at: time, dur: n.dur, pitch: n.pitch };
    }
    if (open && !n.tie) {
      notes.push(open);
      open = null;
    }
    time += n.dur;
  });
  if (open) fail(src, 'Bindebogen am Ende ohne Ton danach');
  return { notes, pickup, bars };
}

// ---------- Akkorde ----------

export interface Chord {
  /** Grundton (Tonklasse 0–11, C = 0). */
  readonly root: number;
  /** Akkordtöne als Abstand zum Grundton. */
  readonly tones: readonly number[];
  /** Basston (Tonklasse), sonst der Grundton. */
  readonly bass: number;
  readonly name: string;
}

export interface ChordSpan {
  readonly at: number;
  readonly dur: number;
  /** null = keine Begleitung (N.C.). */
  readonly chord: Chord | null;
}

const ROOTS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITIES: Readonly<Record<string, readonly number[]>> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
};
const EXTENSIONS: Readonly<Record<string, readonly number[]>> = {
  '': [],
  '7': [10],
  maj7: [11],
  '6': [9],
  '9': [10, 14],
};
// Akkordsymbol: passt auf "C", "Am", "G7", "Bb", "F#m7", "Dm/F", "Bdim7", "Csus4" – nicht auf "H7" oder "Cmaj".
// https://regex101.com/?flavor=javascript&regex=%5E(%5BA-G%5D)(%23%7Cb)%3F(m(%3F!aj)%7Cdim%7Caug%7Csus4%7Csus2)%3F(maj7%7C7%7C6%7C9)%3F(%3F%3A%5C%2F(%5BA-G%5D)(%23%7Cb)%3F)%3F%24&testString=F%23m7%2FA
const CHORD = /^([A-G])(#|b)?(m(?!aj)|dim|aug|sus4|sus2)?(maj7|7|6|9)?(?:\/([A-G])(#|b)?)?$/;

const SHIFTS: Readonly<Record<string, number>> = { '#': 1, b: -1 };
const shiftOf = (sign: string | undefined): number => SHIFTS[sign ?? ''] ?? 0;
const pc = (n: number): number => ((n % OCTAVE) + OCTAVE) % OCTAVE;

/** Ein Akkordsymbol lesen ("G7", "Dm/F"); wirft bei Unbekanntem. */
export function chordOf(symbol: string): Chord {
  const m = CHORD.exec(symbol);
  if (!m) throw new Error(`„${symbol}“ ist kein Akkord`);
  const [, root = 'C', sign, quality = '', ext = '', bassRoot, bassSign] = m;
  const r = pc((ROOTS[root] ?? 0) + shiftOf(sign));
  const dim7 = quality === 'dim' && ext === '7';
  const tones = [...(QUALITIES[quality] ?? []), ...(dim7 ? [9] : (EXTENSIONS[ext] ?? []))];
  const bass = bassRoot ? pc((ROOTS[bassRoot] ?? 0) + shiftOf(bassSign)) : r;
  return { root: r, tones, bass, name: symbol };
}

/**
 * Akkorde je Takt: "C | Am | F G7 | C . . G7". Die Zeichen eines Takts teilen ihn gleichmäßig; „.“ hält den vorigen
 * Akkord, „-“ heißt ohne Begleitung. Wirft, wenn es nicht genau `bars` Takte sind.
 */
export function chordSpans(src: string, meter: Meter, bars: number): ChordSpan[] {
  const bar = BAR_BEATS[meter];
  const groups = src
    .split('|')
    .map((g) => g.trim().split(/\s+/).filter(Boolean))
    .filter((g, i, all) => g.length > 0 || i < all.length - 1);
  if (groups.length !== bars)
    throw new Error(`Akkorde „${src.slice(0, 40)}…“: ${groups.length} statt ${bars} Takte`);
  const spans: ChordSpan[] = [];
  let previous: Chord | null = null;
  groups.forEach((tokens, b) => {
    const step = bar / tokens.length;
    tokens.forEach((token, i) => {
      const hold = token === '.';
      // „.“ hält den vorigen Akkord, „-“ ist ohne Begleitung, sonst ein Akkordsymbol.
      const special: Readonly<Record<string, () => Chord | null>> = { '.': () => previous, '-': () => null };
      const chord = (special[token] ?? (() => chordOf(token)))();
      previous = chord;
      const at = b * bar + i * step;
      const before = spans[spans.length - 1];
      // Gleicher Akkord weiter: nur verlängern (für lange Liegetöne).
      if (before && hold && before.chord === chord) {
        spans[spans.length - 1] = { ...before, dur: before.dur + step };
      } else {
        spans.push({ at, dur: step, chord });
      }
    });
  });
  return spans;
}

/** Akkord, der zu einem Zeitpunkt klingt. */
export function chordAt(spans: readonly ChordSpan[], at: number): Chord | null {
  const span = spans.find((s) => at >= s.at - EPSILON && at < s.at + s.dur - EPSILON);
  return span?.chord ?? null;
}

/** Tonklassen eines Akkords (0–11). */
export function chordClasses(chord: Chord): number[] {
  return chord.tones.map((t) => pc(chord.root + t));
}

export const pitchClass = pc;
