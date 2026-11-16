/* eslint-disable ts-patterns/no-magic-numbers -- an instrument table: General-MIDI programs, mixer levels and note-block ranges as the standards define them */
/**
 * Die Musikanten: welches Instrument welche Stimme spielt – einmal als General-MIDI-Klang (für die Klangdateien im
 * Lobby-Paket, gerendert mit FluidSynth) und einmal als Notenblock-Klang (ohne Paket und für Bedrock, vom
 * Lobby-Plugin gespielt). Alle Notenblock-Klänge gehören zu Minecraft selbst, es liegt nichts davon im Repo.
 */

/** Die 16 Notenblock-Klänge (Reihenfolge = Nummer im Hub-Protokoll, nie umstellen). */
export const NOTE_BLOCKS = [
  'harp',
  'bass',
  'basedrum',
  'snare',
  'hat',
  'bell',
  'flute',
  'chime',
  'guitar',
  'xylophone',
  'iron_xylophone',
  'cow_bell',
  'didgeridoo',
  'bit',
  'banjo',
  'pling',
] as const;
export type NoteBlock = (typeof NOTE_BLOCKS)[number];

/**
 * Tiefster Ton je Notenblock-Klang (MIDI). Jeder umfasst zwei Oktaven ab dort: die Harfe Fis3–Fis5, der Bass zwei
 * Oktaven tiefer, die Glocke zwei höher.
 */
export const BLOCK_LOWEST: Readonly<Record<NoteBlock, number>> = {
  harp: 54,
  bass: 30,
  basedrum: 54,
  snare: 54,
  hat: 54,
  bell: 78,
  flute: 66,
  chime: 78,
  guitar: 42,
  xylophone: 78,
  iron_xylophone: 54,
  cow_bell: 66,
  didgeridoo: 30,
  bit: 54,
  banjo: 54,
  pling: 54,
};
/** Zwei Oktaven je Notenblock. */
export const BLOCK_SPAN = 24;

export interface Layer {
  readonly block: NoteBlock;
  /** Lautstärke-Anteil 0–1. */
  readonly level: number;
}

export interface Instrument {
  /** General-MIDI-Programm (0-basiert). */
  readonly gm: number;
  /** Lautstärke im Mischpult (MIDI-Regler 7). */
  readonly volume: number;
  /** Links (0) – Mitte (64) – rechts (127). */
  readonly pan: number;
  /** Hall (MIDI-Regler 91). */
  readonly reverb: number;
  /** Notenblock-Klänge, die zusammen dieses Instrument nachmachen (leer = ohne Paket stumm, z. B. Streicherflächen). */
  readonly blocks: readonly Layer[];
  /** Klingt der Ton nach (Bläser, Streicher) oder ist er kurz (Zupfen, Schlagen)? */
  readonly sustain: boolean;
}

const I = (
  gm: number,
  volume: number,
  pan: number,
  blocks: readonly Layer[],
  sustain = true,
  reverb = 48,
): Instrument => ({ gm, volume, pan, reverb, blocks, sustain });
const L = (block: NoteBlock, level: number): Layer => ({ block, level });

export const INSTRUMENTS = {
  // Blech
  trompete: I(56, 100, 52, [L('flute', 1), L('harp', 0.35)]),
  fluegelhorn: I(56, 92, 58, [L('flute', 0.95), L('harp', 0.3)]),
  horn: I(60, 92, 84, [L('harp', 0.7), L('pling', 0.25)]),
  posaune: I(57, 88, 76, [L('guitar', 0.7), L('harp', 0.3)]),
  tenorhorn: I(58, 80, 72, [L('guitar', 0.75), L('didgeridoo', 0.2)]),
  tuba: I(58, 108, 66, [L('bass', 1), L('didgeridoo', 0.35)]),
  // Holz
  klarinette: I(71, 92, 40, [L('flute', 0.8), L('pling', 0.25)]),
  floete: I(73, 92, 44, [L('flute', 1)]),
  piccolo: I(72, 78, 40, [L('flute', 0.8), L('bell', 0.2)]),
  oboe: I(68, 88, 46, [L('flute', 0.75), L('bit', 0.15)]),
  fagott: I(70, 96, 70, [L('didgeridoo', 0.6), L('bass', 0.6)]),
  // Volksmusik
  akkordeon: I(21, 86, 36, [L('harp', 0.55), L('pling', 0.35)]),
  hackbrett: I(15, 92, 30, [L('harp', 0.9), L('iron_xylophone', 0.25)], false),
  gitarre: I(24, 88, 88, [L('guitar', 0.8)], false),
  harfe: I(46, 90, 34, [L('harp', 0.9)], false),
  kontrabass: I(32, 104, 66, [L('bass', 1)], false),
  // Streicher, Chor, Orgel
  pizzicato: I(45, 96, 80, [L('harp', 0.55), L('guitar', 0.35)], false),
  streicher: I(48, 70, 64, [], true, 70),
  chor: I(52, 62, 64, [], true, 80),
  orgel: I(19, 70, 64, [L('pling', 0.3)], true, 80),
  // Glocken und Tasten
  celesta: I(8, 92, 40, [L('bell', 0.75), L('chime', 0.2)], false, 70),
  glockenspiel: I(9, 88, 36, [L('bell', 0.9)], false, 70),
  glocken: I(14, 84, 70, [L('chime', 0.8)], false, 90),
  spieluhr: I(10, 86, 44, [L('bell', 0.6), L('iron_xylophone', 0.4)], false, 70),
  cembalo: I(6, 86, 52, [L('harp', 0.6), L('bit', 0.25)], false),
  xylophon: I(13, 92, 44, [L('xylophone', 0.9)], false),
  vibraphon: I(11, 84, 50, [L('iron_xylophone', 0.8)], false, 70),
  pauke: I(47, 100, 64, [L('basedrum', 0.9)], false),
} as const satisfies Record<string, Instrument>;
export type InstrumentId = keyof typeof INSTRUMENTS;

/** Schlagzeug (General-MIDI-Kanal 10): Taste → Notenblock-Klang und Tonhöhe (0,5–2). */
export const DRUMS = {
  kick: { key: 36, block: 'basedrum', pitch: 0.7, level: 0.8 },
  snare: { key: 38, block: 'snare', pitch: 1, level: 0.45 },
  rim: { key: 37, block: 'hat', pitch: 1.4, level: 0.45 },
  hat: { key: 42, block: 'hat', pitch: 1.7, level: 0.35 },
  becken: { key: 46, block: 'hat', pitch: 1.2, level: 0.35 },
  crash: { key: 49, block: 'snare', pitch: 0.6, level: 0.4 },
  klatschen: { key: 39, block: 'snare', pitch: 1.5, level: 0.55 },
  triangel: { key: 81, block: 'bell', pitch: 1.9, level: 0.3 },
  schellen: { key: 83, block: 'hat', pitch: 2, level: 0.35 },
  tamburin: { key: 54, block: 'hat', pitch: 1.85, level: 0.3 },
  tom: { key: 45, block: 'basedrum', pitch: 1.1, level: 0.6 },
  holzblock: { key: 76, block: 'hat', pitch: 1.1, level: 0.5 },
} as const satisfies Record<string, { key: number; block: NoteBlock; pitch: number; level: number }>;
export type DrumId = keyof typeof DRUMS;
export const DRUM_VOLUME = 96;

/** Wer im Arrangement welche Aufgabe hat. */
export type Role = 'lead' | 'lead2' | 'bass' | 'comp' | 'pad' | 'arp';

export interface Voice {
  readonly inst: InstrumentId;
  /** Oktaven höher (+) oder tiefer (−) als die Stimme. */
  readonly octave?: number;
  /** Anteil der Lautstärke 0–1. */
  readonly level?: number;
}

/** Besetzungen: welche Instrumente eine Stimme spielen (mehrere = gedoppelt). */
export const BANDS = {
  /** Blaskapelle für den Alltag: Flügelhorn mit Klarinette darüber, Tenorhorn, Hörner im Nachschlag, Tuba. */
  blaskapelle: {
    lead: [{ inst: 'fluegelhorn' }, { inst: 'klarinette', octave: 1, level: 0.55 }],
    lead2: [{ inst: 'tenorhorn' }],
    bass: [{ inst: 'tuba' }],
    comp: [{ inst: 'horn' }],
    pad: [{ inst: 'posaune', level: 0.6 }],
    arp: [{ inst: 'klarinette', level: 0.7 }],
  },
  /** Bierzelt: Trompete und Klarinette, Akkordeon und Hörner, kräftiges Schlagwerk. */
  wiesn: {
    lead: [{ inst: 'trompete' }, { inst: 'klarinette', octave: 1, level: 0.6 }],
    lead2: [{ inst: 'tenorhorn' }],
    bass: [{ inst: 'tuba' }],
    comp: [{ inst: 'akkordeon' }, { inst: 'horn', level: 0.75 }],
    pad: [{ inst: 'posaune', level: 0.6 }],
    arp: [{ inst: 'klarinette', level: 0.7 }],
  },
  /** Stubenmusik: Klarinette und Hackbrett, Gitarre, Harfe, Kontrabass. */
  alpen: {
    lead: [{ inst: 'klarinette' }, { inst: 'hackbrett', octave: 1, level: 0.35 }],
    lead2: [{ inst: 'akkordeon', level: 0.8 }],
    bass: [{ inst: 'kontrabass' }],
    comp: [{ inst: 'gitarre' }],
    pad: [{ inst: 'akkordeon', level: 0.5 }],
    arp: [{ inst: 'harfe', level: 0.8 }],
  },
  /** Winter, leise: Celesta und Glockenspiel, Harfe, Streicher. */
  glocken: {
    lead: [{ inst: 'celesta' }, { inst: 'glockenspiel', level: 0.45 }],
    lead2: [{ inst: 'floete', level: 0.6 }],
    bass: [{ inst: 'kontrabass', level: 0.8 }],
    comp: [{ inst: 'harfe', level: 0.7 }],
    pad: [{ inst: 'streicher' }],
    arp: [{ inst: 'harfe' }],
  },
  /** Turmblasen zur Weihnacht: Trompete, Flügelhorn, Posaune, Tuba – langsam und feierlich. */
  turm: {
    lead: [{ inst: 'trompete' }],
    lead2: [{ inst: 'fluegelhorn', level: 0.85 }],
    bass: [{ inst: 'tuba' }],
    comp: [{ inst: 'horn', level: 0.7 }],
    pad: [
      { inst: 'posaune', level: 0.75 },
      { inst: 'horn', level: 0.55 },
    ],
    arp: [{ inst: 'glocken', level: 0.6 }],
  },
  /** Frühling: Flöte und Oboe, Pizzicato, Harfe. */
  fruehling: {
    lead: [{ inst: 'floete' }],
    lead2: [{ inst: 'oboe', level: 0.75 }],
    bass: [{ inst: 'kontrabass', level: 0.85 }],
    comp: [{ inst: 'pizzicato' }],
    pad: [{ inst: 'streicher', level: 0.7 }],
    arp: [{ inst: 'harfe' }],
  },
  /** Morgenstimmung: die Oboe antwortet der Flöte. */
  morgen: {
    lead: [{ inst: 'oboe' }],
    lead2: [{ inst: 'floete', level: 0.7 }],
    bass: [{ inst: 'kontrabass', level: 0.85 }],
    comp: [{ inst: 'pizzicato' }],
    pad: [{ inst: 'streicher', level: 0.8 }],
    arp: [{ inst: 'harfe' }],
  },
  /** Halloween: Fagott und Cembalo, Pizzicato, Pauke, Orgel. */
  spuk: {
    lead: [{ inst: 'fagott' }, { inst: 'cembalo', octave: 1, level: 0.4 }],
    lead2: [{ inst: 'oboe', level: 0.6 }],
    bass: [{ inst: 'pizzicato' }, { inst: 'kontrabass', level: 0.6 }],
    comp: [{ inst: 'cembalo', level: 0.7 }],
    pad: [{ inst: 'orgel', level: 0.7 }],
    arp: [{ inst: 'celesta', level: 0.8 }],
  },
  /** Gruselig hell: Xylophon (klappernde Knochen), Celesta, Pizzicato. */
  geister: {
    lead: [{ inst: 'xylophon' }, { inst: 'celesta', level: 0.4 }],
    lead2: [{ inst: 'vibraphon', level: 0.6 }],
    bass: [{ inst: 'kontrabass' }],
    comp: [{ inst: 'pizzicato', level: 0.7 }],
    pad: [{ inst: 'chor', level: 0.8 }],
    arp: [{ inst: 'celesta', level: 0.8 }],
  },
} as const satisfies Record<string, Partial<Record<Role, readonly Voice[]>>>;
export type Band = keyof typeof BANDS;
