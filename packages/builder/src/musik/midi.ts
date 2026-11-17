/* eslint-disable ts-patterns/no-magic-numbers -- the Standard MIDI File format: status bytes, meta types and controller numbers as the spec defines them */
import { createHash } from 'node:crypto';
import { DRUM_VOLUME, INSTRUMENTS, type InstrumentId } from './band.js';
import { lengthTicks, type Arrangement } from './arrangement.js';

/**
 * MIDI-Datei (Standard MIDI File, Typ 1) aus einem Arrangement – daraus rendert `tools/lobby-musik` mit FluidSynth
 * die Klangdateien fürs Lobby-Paket. Leicht „menschlich“ gespielt (Zeitpunkt und Anschlag schwanken ein wenig, immer
 * gleich für dasselbe Lied).
 */

const TPQ = 480;
const DRUM_CHANNEL = 9;
const MICROS_PER_TICK = 50_000;
/** Nach dem Schlussakkord: Platz für den Nachhall. */
const TAIL_QUARTERS = 3;
const JITTER_TICKS = 7;
const JITTER_VEL = 5;
const MIN_NOTE_TICKS = 30;

/** Zahl als MIDI-Längenangabe: je 7 Bit, alle außer dem letzten mit gesetztem Hochbit. */
function vlq(n: number): number[] {
  const groups = Math.max(1, Math.ceil(Math.log2(n + 1) / 7));
  return Array.from({ length: groups }, (_, i) => {
    const shift = 7 * (groups - 1 - i);
    const bits = Math.floor(n / 2 ** shift) & 0x7f;
    return i < groups - 1 ? bits | 0x80 : bits;
  });
}

function chunk(type: string, data: number[]): Buffer {
  const head = Buffer.alloc(8);
  head.write(type, 0, 'ascii');
  head.writeUInt32BE(data.length, 4);
  return Buffer.concat([head, Buffer.from(data)]);
}

/** Zufall mit festem Startwert (Mulberry32): gleiches Lied, gleiche kleine Schwankungen. */
function random(seedText: string): () => number {
  let seed = [...seedText].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Event {
  readonly tick: number;
  readonly order: number;
  readonly bytes: number[];
}

function track(events: Event[]): Buffer {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data: number[] = [];
  let last = 0;
  sorted.forEach((e) => {
    data.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  });
  data.push(0, 0xff, 0x2f, 0);
  return chunk('MTrk', data);
}

/** Erhöhen, wenn sich am Rendern etwas ändert (MIDI-Aufbau, Mischung) – dann gelten alle Klangdateien als alt. */
export const RENDER_VERSION = 1;
const FINGERPRINT_LENGTH = 16;

/**
 * Fingerabdruck eines Lieds: Noten, Tempo und Mischpult der benutzten Instrumente. Ändert sich einer davon, passt die
 * Klangdatei nicht mehr zum Lied (der Server-Test meldet es, `tools/lobby-musik` rendert neu).
 */
export function songFingerprint(a: Arrangement): string {
  const used = [...new Set(a.hits.map((h) => h.inst))].sort();
  const mix = used.map((inst) => (inst === 'drums' ? DRUM_VOLUME : INSTRUMENTS[inst]));
  const body = JSON.stringify({
    v: RENDER_VERSION,
    tempo: a.tempo,
    meter: a.meter,
    beats: a.beats,
    hits: a.hits,
    mix,
  });
  return createHash('sha256').update(body).digest('hex').slice(0, FINGERPRINT_LENGTH);
}

/** Wie lange die MIDI-Datei läuft (Sekunden) – Lied plus Nachhall. */
export function midiSeconds(a: Arrangement): number {
  const last = a.tempo[a.tempo.length - 1]?.tpb ?? a.tpb;
  return (lengthTicks(a) + TAIL_QUARTERS * last) / 20;
}

export function songMidi(a: Arrangement): Buffer {
  const rand = random(a.id);
  const jitter = (n: number): number => Math.round((rand() * 2 - 1) * n);
  const endTick = Math.round((a.beats + TAIL_QUARTERS) * TPQ);
  const [num, den] = a.meter.split('/').map(Number) as [number, number];
  const tempos: Event[] = a.tempo.map((change) => {
    const micros = change.tpb * MICROS_PER_TICK;
    const bytes = [0xff, 0x51, 3, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff];
    return { tick: Math.round(change.at * TPQ), order: 0, bytes };
  });
  const meta: Event[] = [
    ...tempos,
    { tick: 0, order: 0, bytes: [0xff, 0x58, 4, num, Math.log2(den), 24, 8] },
    { tick: endTick, order: 9, bytes: [0xff, 0x01, 0] },
  ];
  const instruments = [...new Set(a.hits.map((h) => h.inst).filter((i) => i !== 'drums'))] as InstrumentId[];
  if (instruments.length > 15) throw new Error(`${a.id}: mehr als 15 Instrumente`);
  const channelOf = new Map(instruments.map((inst, i) => [inst, i >= DRUM_CHANNEL ? i + 1 : i]));
  const tracks = instruments.map((inst) => {
    const ch = channelOf.get(inst) ?? 0;
    const def = INSTRUMENTS[inst];
    const setup: Event[] = [
      { tick: 0, order: 0, bytes: [0xc0 | ch, def.gm] },
      { tick: 0, order: 1, bytes: [0xb0 | ch, 7, def.volume] },
      { tick: 0, order: 1, bytes: [0xb0 | ch, 10, def.pan] },
      { tick: 0, order: 1, bytes: [0xb0 | ch, 91, def.reverb] },
      { tick: 0, order: 1, bytes: [0xb0 | ch, 93, 0] },
    ];
    const notes = a.hits
      .filter((h) => h.inst === inst)
      .flatMap((h): Event[] => {
        const start = Math.max(0, Math.round(h.at * TPQ) + (h.at > 0 ? jitter(JITTER_TICKS) : 0));
        const gate = def.sustain ? 0.94 : 1;
        const stop = Math.max(start + MIN_NOTE_TICKS, Math.round((h.at + h.dur * gate) * TPQ));
        const vel = Math.max(1, Math.min(127, h.vel + jitter(JITTER_VEL)));
        const pitch = Math.max(0, Math.min(127, h.pitch));
        return [
          { tick: start, order: 3, bytes: [0x90 | ch, pitch, vel] },
          { tick: stop, order: 2, bytes: [0x80 | ch, pitch, 0] },
        ];
      });
    return track([...setup, ...notes]);
  });
  const drumEvents: Event[] = [
    { tick: 0, order: 1, bytes: [0xb0 | DRUM_CHANNEL, 7, DRUM_VOLUME] },
    { tick: 0, order: 1, bytes: [0xb0 | DRUM_CHANNEL, 91, 40] },
    ...a.hits
      .filter((h) => h.inst === 'drums')
      .flatMap((h): Event[] => {
        const start = Math.max(0, Math.round(h.at * TPQ) + (h.at > 0 ? jitter(3) : 0));
        const vel = Math.max(1, Math.min(127, h.vel + jitter(JITTER_VEL)));
        return [
          { tick: start, order: 3, bytes: [0x90 | DRUM_CHANNEL, h.pitch, vel] },
          { tick: start + TPQ / 4, order: 2, bytes: [0x80 | DRUM_CHANNEL, h.pitch, 0] },
        ];
      }),
  ];
  const all = [track(meta), ...tracks, track(drumEvents)];
  const header = Buffer.alloc(6);
  header.writeUInt16BE(1, 0);
  header.writeUInt16BE(all.length, 2);
  header.writeUInt16BE(TPQ, 4);
  return Buffer.concat([chunk('MThd', [...header]), ...all]);
}
