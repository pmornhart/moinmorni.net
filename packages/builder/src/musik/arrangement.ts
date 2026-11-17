/* eslint-disable ts-patterns/no-magic-numbers -- an arranger: beat positions, registers and velocities as musicians count them */
import {
  BAR_BEATS,
  chordAt,
  chordClasses,
  chordSpans,
  phrase,
  pitchClass,
  type Chord,
  type ChordSpan,
  type Meter,
  type Note,
} from './noten.js';
import { BANDS, DRUMS, type Band, type DrumId, type InstrumentId, type Role, type Voice } from './band.js';

/**
 * Aus Melodie und Akkorden wird eine Kapelle: Bass auf den Hauptschlägen, Nachschlag dazwischen, zweite Stimme in
 * Terzen, Liegeakkorde oder gebrochene Akkorde, Schlagwerk – je nach Stil (Polka, Marsch, Walzer, Ländler, Lied,
 * Choral, Wiegenlied, Spuk). Dasselbe Ergebnis spielt die Klangdatei (General MIDI) und das Plugin (Notenblöcke).
 */

export type Style = 'polka' | 'marsch' | 'walzer' | 'laendler' | 'lied' | 'choral' | 'wiege' | 'spuk';

export interface Part {
  /** Melodie (siehe noten.ts); "r1 | r1" für Takte ohne Melodie. */
  readonly melody: string;
  /** Akkorde je Takt. */
  readonly chords: string;
}

export interface Section {
  readonly part: string;
  readonly style?: Style;
  readonly band?: Band;
  /** Lautstärke 0–1 (Vorgabe 0,8). */
  readonly dyn?: number;
  /** Melodie in Oktaven verschoben. */
  readonly octave?: number;
  /** Zweite Stimme in Terzen und Sexten. */
  readonly second?: boolean;
  /** Gebrochene Akkorde in Achteln dazu. */
  readonly arp?: boolean;
  /** Liegende Akkorde dazu. */
  readonly pad?: boolean;
  /** Schlagwerk (Vorgabe je Stil). */
  readonly drums?: boolean;
  /** Grundton dieses Teils (Tonklasse vor dem Transponieren), z. B. für ein Trio in der Unterdominante. */
  readonly key?: number;
  readonly minor?: boolean;
  /** Ohne Melodie (Vorspiel, Zwischenspiel). */
  readonly noLead?: boolean;
  /** Diesen Teil um so viele Halbtöne höher spielen (Tonartwechsel, z. B. +4 für eine große Terz). */
  readonly shift?: number;
  /** Eigenes Tempo ab diesem Teil (Minecraft-Ticks je Viertel), z. B. schneller werden. */
  readonly tpb?: number;
  /** Zusätzlich: Klatschen (Schuhplattler), Schlittenschellen oder Triangel. */
  readonly perc?: Percussion;
}

export type Percussion = 'klatschen' | 'schellen' | 'triangel';

/** Wo die Zusatz-Schläge liegen: Klatschen auf den Nebenschlägen, Schellen in Achteln, Triangel auf der Eins. */
const PERCUSSION: Readonly<Record<Percussion, (bar: number) => ReadonlyArray<readonly [number, number]>>> = {
  klatschen: (bar) => Array.from({ length: Math.round(bar) - 1 }, (_, i) => [i + 1, 0.8] as const),
  schellen: (bar) =>
    Array.from({ length: Math.round(bar * 2) }, (_, i) => [i / 2, i % 2 === 0 ? 0.7 : 0.45] as const),
  triangel: () => [[0, 0.7]],
};

export interface Song {
  readonly id: string;
  readonly meter: Meter;
  /** Minecraft-Ticks je Viertel (20 Ticks = 1 s): 10 = 120 Schläge pro Minute. */
  readonly tpb: number;
  /** Halbtöne, um die alles verschoben klingt. */
  readonly transpose: number;
  /** Grundton (Tonklasse vor dem Transponieren). */
  readonly key: number;
  readonly minor?: boolean;
  readonly style: Style;
  readonly band: Band;
  readonly parts: Readonly<Record<string, Part>>;
  readonly form: readonly Section[];
  /** Schluss: ein gehaltener Schlussakkord (Vorgabe) oder ein kurzer. */
  readonly ending?: 'hold' | 'kurz';
}

/** Ein gespielter Ton. */
export interface Hit {
  /** Beginn in Vierteln ab Liedanfang. */
  readonly at: number;
  readonly dur: number;
  /** MIDI-Tonhöhe; beim Schlagwerk die Taste. */
  readonly pitch: number;
  /** Anschlag 1–127. */
  readonly vel: number;
  /** Instrument oder Schlagwerk. */
  readonly inst: InstrumentId | 'drums';
  readonly drum?: DrumId;
}

/** Ab welchem Viertel welches Tempo gilt (Ticks je Viertel). */
export interface TempoChange {
  readonly at: number;
  readonly tpb: number;
}

export interface Arrangement {
  readonly id: string;
  /** Tempo am Anfang (Ticks je Viertel). */
  readonly tpb: number;
  /** Tempowechsel (der erste bei 0). */
  readonly tempo: readonly TempoChange[];
  readonly meter: Meter;
  /** Länge in Vierteln (mit Schlussakkord). */
  readonly beats: number;
  readonly hits: readonly Hit[];
}

interface RoleHit {
  readonly at: number;
  readonly dur: number;
  readonly pitch: number;
  readonly vel: number;
  readonly role: Role;
}

interface DrumHit {
  readonly at: number;
  readonly drum: DrumId;
  readonly vel: number;
}

/** Wo Bass (Grundton/Quinte), Nachschlag und Schlagwerk je Stil und Takt liegen. */
interface Pattern {
  readonly bass: ReadonlyArray<readonly [number, 'root' | 'fifth']>;
  readonly bassDur: number;
  readonly comp: readonly number[];
  readonly compDur: number;
  readonly drums: ReadonlyArray<readonly [number, DrumId, number]>;
}

const NONE: Pattern = { bass: [], bassDur: 1, comp: [], compDur: 0.5, drums: [] };

const PATTERNS: Readonly<Record<Style, Partial<Record<Meter, Pattern>>>> = {
  polka: {
    '2/4': {
      bass: [
        [0, 'root'],
        [1, 'fifth'],
      ],
      bassDur: 0.45,
      comp: [0.5, 1.5],
      compDur: 0.28,
      drums: [
        [0, 'kick', 1],
        [1, 'kick', 0.8],
        [0.5, 'becken', 0.7],
        [1.5, 'becken', 0.7],
      ],
    },
    '4/4': {
      bass: [
        [0, 'root'],
        [1, 'fifth'],
        [2, 'root'],
        [3, 'fifth'],
      ],
      bassDur: 0.45,
      comp: [0.5, 1.5, 2.5, 3.5],
      compDur: 0.28,
      drums: [
        [0, 'kick', 1],
        [1, 'kick', 0.7],
        [2, 'kick', 0.85],
        [3, 'kick', 0.7],
        [0.5, 'becken', 0.6],
        [1.5, 'becken', 0.6],
        [2.5, 'becken', 0.6],
        [3.5, 'becken', 0.6],
      ],
    },
  },
  marsch: {
    '2/4': {
      bass: [
        [0, 'root'],
        [1, 'fifth'],
      ],
      bassDur: 0.5,
      comp: [0.5, 1.5],
      compDur: 0.3,
      drums: [
        [0, 'kick', 1],
        [0, 'crash', 0.25],
        [1, 'snare', 0.75],
        [1.75, 'snare', 0.4],
        [0.5, 'hat', 0.5],
        [1.5, 'hat', 0.5],
      ],
    },
    '4/4': {
      bass: [
        [0, 'root'],
        [2, 'fifth'],
      ],
      bassDur: 0.8,
      comp: [1, 3],
      compDur: 0.6,
      drums: [
        [0, 'kick', 1],
        [2, 'kick', 0.85],
        [1, 'snare', 0.7],
        [3, 'snare', 0.7],
        [3.5, 'snare', 0.35],
        [0.5, 'hat', 0.4],
        [1.5, 'hat', 0.4],
        [2.5, 'hat', 0.4],
      ],
    },
    '6/8': {
      bass: [
        [0, 'root'],
        [1.5, 'fifth'],
      ],
      bassDur: 0.7,
      comp: [1, 2.5],
      compDur: 0.4,
      drums: [
        [0, 'kick', 1],
        [1.5, 'kick', 0.8],
        [1, 'snare', 0.55],
        [2.5, 'snare', 0.55],
        [2, 'snare', 0.3],
      ],
    },
  },
  walzer: {
    '3/4': {
      bass: [[0, 'root']],
      bassDur: 0.8,
      comp: [1, 2],
      compDur: 0.45,
      drums: [
        [0, 'kick', 0.9],
        [1, 'becken', 0.45],
        [2, 'becken', 0.45],
      ],
    },
  },
  laendler: {
    '3/4': {
      bass: [[0, 'root']],
      bassDur: 0.9,
      comp: [1, 2],
      compDur: 0.4,
      drums: [],
    },
  },
  lied: {
    '2/4': { bass: [[0, 'root']], bassDur: 0.8, comp: [1], compDur: 0.5, drums: [] },
    '3/4': { bass: [[0, 'root']], bassDur: 0.9, comp: [1, 2], compDur: 0.5, drums: [] },
    '4/4': {
      bass: [
        [0, 'root'],
        [2, 'fifth'],
      ],
      bassDur: 0.9,
      comp: [1, 3],
      compDur: 0.6,
      drums: [],
    },
    '2/2': {
      bass: [
        [0, 'root'],
        [2, 'fifth'],
      ],
      bassDur: 0.9,
      comp: [1, 3],
      compDur: 0.6,
      drums: [],
    },
    '6/8': {
      bass: [
        [0, 'root'],
        [1.5, 'fifth'],
      ],
      bassDur: 1.2,
      comp: [1, 2.5],
      compDur: 0.4,
      drums: [],
    },
  },
  choral: {},
  wiege: {},
  spuk: {
    '2/4': {
      bass: [
        [0, 'root'],
        [0.5, 'fifth'],
        [1, 'root'],
        [1.5, 'fifth'],
      ],
      bassDur: 0.3,
      comp: [0.5, 1.5],
      compDur: 0.2,
      drums: [[0, 'tom', 0.8]],
    },
    '3/4': {
      bass: [
        [0, 'root'],
        [1, 'fifth'],
        [2, 'fifth'],
      ],
      bassDur: 0.4,
      comp: [1, 2],
      compDur: 0.25,
      drums: [[0, 'tom', 0.8]],
    },
    '4/4': {
      bass: [
        [0, 'root'],
        [0.5, 'fifth'],
        [1, 'root'],
        [1.5, 'fifth'],
        [2, 'root'],
        [2.5, 'fifth'],
        [3, 'root'],
        [3.5, 'fifth'],
      ],
      bassDur: 0.3,
      comp: [],
      compDur: 0.2,
      drums: [
        [0, 'tom', 0.8],
        [2, 'tom', 0.6],
      ],
    },
  },
};

/** Lagen: wo Bass, Begleitung und Liegeakkorde klingen (MIDI). */
const BASS_LOW = 33;
const BASS_HIGH = 47;
const COMP_LOW = 55;
const COMP_HIGH = 70;
const PAD_LOW = 50;
const PAD_HIGH = 67;
const ARP_BASE = 60;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
const DEFAULT_DYN = 0.8;
const FULL = 112;
const EPS = 1e-6;

/** Ton mit dieser Tonklasse, der `near` am nächsten liegt, innerhalb von [low, high]. */
function nearest(pcValue: number, near: number, low: number, high: number): number {
  const candidates = Array.from({ length: 11 }, (_, o) => pcValue + 12 * o).filter(
    (p) => p >= low && p <= high,
  );
  return candidates.reduce(
    (best, p) => (Math.abs(p - near) < Math.abs(best - near) ? p : best),
    candidates[0] ?? low,
  );
}

/** Enge Lage eines Akkords nahe am vorigen Klang (Stimmführung). */
function voicing(chord: Chord, previous: readonly number[], low: number, high: number, size = 3): number[] {
  const classes = chordClasses(chord).slice(0, Math.max(size, 3));
  // Bei Septakkorden ohne Quinte, damit es drei bzw. vier Töne bleiben.
  const tones = classes.length > size ? classes.filter((_, i) => i !== 2) : classes;
  const center = previous.length ? previous.reduce((a, b) => a + b, 0) / previous.length : (low + high) / 2;
  const options = tones.map((_, rot) => {
    const order = [...tones.slice(rot), ...tones.slice(0, rot)];
    const start = nearest(order[0] ?? 0, center - 4, low, high - 7);
    return order.reduce<number[]>((acc, cls) => {
      const prev = acc[acc.length - 1] ?? start - 1;
      const next = Array.from({ length: 3 }, (_, o) => cls + 12 * Math.floor(prev / 12) + 12 * (o - 1)).find(
        (p) => p > prev,
      );
      return [...acc, next ?? prev + 1];
    }, []);
  });
  const fit = (v: number[]): number => Math.abs(v.reduce((a, b) => a + b, 0) / v.length - center);
  return options.reduce((best, v) => (fit(v) < fit(best) ? v : best), options[0] ?? []);
}

/** Zweite Stimme: Akkordton (Terz/Sexte) unter der Melodie, sonst die Terz der Tonleiter darunter. */
function harmony(note: number, chord: Chord | null, tonic: number, minor: boolean): number | null {
  const scale = (minor ? HARMONIC_MINOR : MAJOR).map((s) => pitchClass(s + tonic));
  if (chord) {
    const classes = chordClasses(chord);
    if (classes.includes(pitchClass(note))) {
      const below = [3, 4, 5, 6, 7, 8, 9].map((d) => note - d).find((p) => classes.includes(pitchClass(p)));
      if (below !== undefined) return below;
    }
  }
  const degree = scale.indexOf(pitchClass(note));
  if (degree < 0) return null;
  const target = scale[(degree + scale.length - 2) % scale.length] ?? 0;
  const down = pitchClass(note - target);
  return note - (down === 0 ? 12 : down);
}

interface Placed {
  readonly section: Section;
  readonly notes: readonly Note[];
  readonly chords: readonly ChordSpan[];
  readonly start: number;
  readonly bars: number;
}

/** Ein Lied aus Melodie, Akkorden und Form zur ganzen Kapelle ausarbeiten. */
export function arrange(song: Song): Arrangement {
  const bar = BAR_BEATS[song.meter];
  const placed: Placed[] = [];
  let cursor = 0;
  song.form.forEach((section) => {
    const part = song.parts[section.part];
    if (!part) throw new Error(`${song.id}: Teil „${section.part}“ fehlt`);
    const p = phrase(part.melody, song.meter);
    const chords = chordSpans(part.chords, song.meter, p.bars);
    const shift = section.shift ?? 0;
    const notes = shift ? p.notes.map((n) => ({ ...n, pitch: n.pitch + shift })) : p.notes;
    const moved = shift
      ? chords.map((c) => ({ ...c, chord: c.chord ? shiftChord(c.chord, shift) : null }))
      : chords;
    placed.push({ section, notes, chords: moved, start: cursor, bars: p.bars });
    cursor += p.bars * bar;
  });
  const firstPickup = -Math.min(0, ...(placed[0]?.notes.map((n) => n.at) ?? [0]));
  const offset = firstPickup;
  const roles: RoleHit[] = [];
  const drums: DrumHit[] = [];
  let compPrev: number[] = [];
  let padPrev: number[] = [];
  let bassPrev = 40;

  placed.forEach((pl) => {
    const s = pl.section;
    const style = s.style ?? song.style;
    const dyn = (s.dyn ?? DEFAULT_DYN) * FULL;
    const tonic = pitchClass((s.key ?? song.key) + (s.shift ?? 0));
    const minor = s.minor ?? song.minor ?? false;
    const base = pl.start + offset;
    const lead = s.noLead ? [] : pl.notes;
    // Melodie (eine Note endet spätestens, wo die nächste anfängt – auch über Teile hinweg).
    lead.forEach((n) => {
      const pitch = n.pitch + 12 * (s.octave ?? 0);
      // Betonte Zählzeit (1 und 3): etwas kräftiger.
      const strong = Math.abs(n.at - Math.round(n.at)) < EPS && Math.round(n.at) % 2 === 0;
      roles.push({ at: base + n.at, dur: n.dur, pitch, vel: dyn * (strong ? 1 : 0.92), role: 'lead' });
      if (s.second && n.dur >= 0.24) {
        const h = harmony(pitch, chordAt(pl.chords, Math.max(0, n.at)), tonic, minor);
        if (h !== null) roles.push({ at: base + n.at, dur: n.dur, pitch: h, vel: dyn * 0.78, role: 'lead2' });
      }
    });
    const pattern = PATTERNS[style][song.meter] ?? NONE;
    const playDrums = s.drums ?? pattern.drums.length > 0;
    Array.from({ length: pl.bars }, (_, b) => b).forEach((b) => {
      const at0 = b * bar;
      pattern.bass.forEach(([pos, which]) => {
        const chord = chordAt(pl.chords, at0 + pos);
        if (!chord) return;
        const want = which === 'root' ? chord.bass : pitchClass(chord.root + 7);
        const pitch = nearest(want, which === 'root' ? bassPrev : bassPrev + 3, BASS_LOW, BASS_HIGH);
        if (which === 'root') bassPrev = pitch;
        roles.push({ at: base + at0 + pos, dur: pattern.bassDur, pitch, vel: dyn * 0.9, role: 'bass' });
      });
      pattern.comp.forEach((pos) => {
        const chord = chordAt(pl.chords, at0 + pos);
        if (!chord) return;
        const v = voicing(chord, compPrev, COMP_LOW, COMP_HIGH);
        compPrev = v;
        v.forEach((pitch) =>
          roles.push({ at: base + at0 + pos, dur: pattern.compDur, pitch, vel: dyn * 0.62, role: 'comp' }),
        );
      });
      if (s.perc)
        PERCUSSION[s.perc](bar).forEach(([pos, level]) =>
          drums.push({ at: base + at0 + pos, drum: s.perc as DrumId, vel: dyn * level }),
        );
      if (playDrums)
        pattern.drums.forEach(([pos, drum, level]) =>
          drums.push({ at: base + at0 + pos, drum, vel: dyn * level * (b % 2 === 0 || pos > 0 ? 1 : 0.9) }),
        );
      // Wiegenlied: Bass auf 1 und 4 (6/8) bzw. auf jedem Takt, gebrochene Akkorde in Achteln.
      if (style === 'wiege') {
        [0, bar / 2].forEach((pos) => {
          const chord = chordAt(pl.chords, at0 + pos);
          if (!chord) return;
          const pitch = nearest(
            pos === 0 ? chord.bass : pitchClass(chord.root + 7),
            bassPrev,
            BASS_LOW,
            BASS_HIGH,
          );
          if (pos === 0) bassPrev = pitch;
          roles.push({ at: base + at0 + pos, dur: bar / 2, pitch, vel: dyn * 0.75, role: 'bass' });
        });
      }
    });
    // Choral und Wiegenlied: liegende Akkorde und Bass je Akkord.
    const sustained = style === 'choral' || style === 'wiege' || s.pad;
    if (sustained)
      pl.chords.forEach((span) => {
        if (!span.chord) return;
        const v = voicing(span.chord, padPrev, PAD_LOW, PAD_HIGH, 4);
        padPrev = v;
        v.forEach((pitch) =>
          roles.push({ at: base + span.at, dur: span.dur, pitch, vel: dyn * 0.55, role: 'pad' }),
        );
        if (style === 'choral') {
          const pitch = nearest(span.chord.bass, bassPrev, BASS_LOW - 2, BASS_HIGH);
          bassPrev = pitch;
          roles.push({ at: base + span.at, dur: span.dur, pitch, vel: dyn * 0.8, role: 'bass' });
        }
      });
    // Gebrochene Akkorde in Achteln: Grundton, Quinte, Oktave, Terz – wie Harfe oder Hackbrett.
    if (s.arp || style === 'wiege') {
      const steps = Math.round(pl.bars * bar * 2);
      Array.from({ length: steps }, (_, i) => i * 0.5).forEach((t) => {
        const chord = chordAt(pl.chords, t);
        if (!chord) return;
        const classes = chordClasses(chord);
        const order = [0, 2, 0, 1, 2, 1];
        const cls = classes[order[Math.round(t * 2) % order.length] ?? 0] ?? chord.root;
        const octave = Math.round(t * 2) % order.length === 2 ? 12 : 0;
        const pitch = nearest(cls, ARP_BASE, ARP_BASE - 2, ARP_BASE + 10) + octave;
        roles.push({ at: base + t, dur: 0.5, pitch, vel: dyn * 0.5, role: 'arp' });
      });
    }
  });

  // Schlussakkord: letzter Akkord des letzten Teils, eine Takt lang (oder kurz).
  const last = placed[placed.length - 1];
  const end = cursor + offset;
  const finalChord = last ? [...last.chords].reverse().find((c) => c.chord)?.chord : undefined;
  const hold = song.ending !== 'kurz';
  const finalDur = hold ? bar : 0.5;
  if (finalChord && last) {
    const dyn = (last.section.dyn ?? DEFAULT_DYN) * FULL;
    voicing(finalChord, padPrev, PAD_LOW, PAD_HIGH, 4).forEach((pitch) =>
      roles.push({ at: end, dur: finalDur, pitch, vel: dyn * 0.7, role: 'pad' }),
    );
    voicing(finalChord, compPrev, COMP_LOW, COMP_HIGH).forEach((pitch) =>
      roles.push({ at: end, dur: finalDur, pitch, vel: dyn * 0.7, role: 'comp' }),
    );
    roles.push({
      at: end,
      dur: finalDur,
      pitch: nearest(finalChord.root, bassPrev, BASS_LOW, BASS_HIGH),
      vel: dyn,
      role: 'bass',
    });
    const top = nearest(finalChord.root, 72, 64, 79);
    roles.push({ at: end, dur: finalDur, pitch: top, vel: dyn, role: 'lead' });
    if (
      last.section.drums ??
      (PATTERNS[last.section.style ?? song.style][song.meter] ?? NONE).drums.length > 0
    )
      drums.push({ at: end, drum: 'kick', vel: dyn }, { at: end, drum: 'crash', vel: dyn * 0.6 });
  }
  const beats = end + bar;

  // Melodie: Töne enden, bevor der nächste beginnt (Auftakt über einen gehaltenen Ton hinweg).
  const leads = roles.filter((r) => r.role === 'lead').sort((a, b) => a.at - b.at);
  const trimmed = new Map<RoleHit, RoleHit>();
  leads.forEach((r, i) => {
    const next = leads.slice(i + 1).find((n) => n.at > r.at + EPS);
    if (next && r.at + r.dur > next.at + EPS) trimmed.set(r, { ...r, dur: next.at - r.at });
  });
  const finalRoles = roles.map((r) => trimmed.get(r) ?? r);

  // Stimmen auf die Instrumente der Besetzung verteilen.
  const hits: Hit[] = [];
  const bandAt = (at: number): Band => {
    const pl = placed.find((p) => at >= p.start + offset - EPS && at < p.start + offset + p.bars * bar - EPS);
    return (pl?.section.band ?? last?.section.band ?? song.band) as Band;
  };
  finalRoles.forEach((r) => {
    const voices: readonly Voice[] = BANDS[bandAt(Math.max(0, r.at))][r.role] ?? [];
    voices.forEach((v) =>
      hits.push({
        at: r.at,
        dur: r.dur,
        pitch: r.pitch + song.transpose + 12 * (v.octave ?? 0),
        vel: Math.max(1, Math.min(127, Math.round(r.vel * (v.level ?? 1)))),
        inst: v.inst,
      }),
    );
  });
  drums.forEach((d) =>
    hits.push({
      at: d.at,
      dur: 0.25,
      pitch: DRUMS[d.drum].key,
      vel: Math.max(1, Math.min(127, Math.round(d.vel))),
      inst: 'drums',
      drum: d.drum,
    }),
  );
  hits.sort((a, b) => a.at - b.at || a.pitch - b.pitch);
  // Tempo: wo ein Teil ein eigenes hat, gilt es ab seinem ersten vollen Takt (der Schluss behält das letzte).
  const tempo = placed.reduce<TempoChange[]>(
    (list, pl) => {
      const tpb = pl.section.tpb ?? list[list.length - 1]?.tpb ?? song.tpb;
      const at = pl.start + offset;
      return (list[list.length - 1]?.tpb ?? song.tpb) === tpb ? list : [...list, { at, tpb }];
    },
    [{ at: 0, tpb: song.tpb }],
  );
  return { id: song.id, tpb: song.tpb, tempo, meter: song.meter, beats, hits };
}

/** Akkord um Halbtöne verschoben. */
function shiftChord(chord: Chord, by: number): Chord {
  return { ...chord, root: pitchClass(chord.root + by), bass: pitchClass(chord.bass + by) };
}

/** Viertel ab Liedanfang → Minecraft-Ticks (mit Tempowechseln, auf ganze Ticks gerundet). */
export function beatToTick(a: Arrangement, beat: number): number {
  const exact = a.tempo.reduce((ticks, change, i) => {
    const end = Math.min(beat, a.tempo[i + 1]?.at ?? Infinity);
    return end > change.at ? ticks + (end - change.at) * change.tpb : ticks;
  }, 0);
  return Math.round(exact);
}

/** Länge in Minecraft-Ticks. */
export function lengthTicks(a: Arrangement): number {
  return beatToTick(a, a.beats);
}

/** Länge in Sekunden. */
export function lengthSeconds(a: Arrangement): number {
  return lengthTicks(a) / 20;
}
