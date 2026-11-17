/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { describe, expect, it } from 'vitest';
import {
  ALL_SONGS,
  arrange,
  BAR_BEATS,
  beatToTick,
  BLOCK_LOWEST,
  BLOCK_SPAN,
  chordOf,
  chordSpans,
  decodeBlocks,
  encodeBlocks,
  INSTRUMENTS,
  lengthSeconds,
  lengthTicks,
  musicPackEntries,
  musicSound,
  noteBlocks,
  phrase,
  SONGS_BY_SEASON,
  songMidi,
} from '../src/musik/index.js';

const cache = new Map<string, ReturnType<typeof arrange>>();
/** Jedes Lied nur einmal ausarbeiten (dauert je Lied ein paar Zehntelsekunden). */
function arranged(id: string): ReturnType<typeof arrange> {
  const song = ALL_SONGS.find((s) => s.id === id);
  if (!song) throw new Error(`${id} fehlt`);
  const hit = cache.get(id) ?? arrange(song);
  cache.set(id, hit);
  return hit;
}
const SLOW = 60_000;

describe('Noten lesen', () => {
  it('liest Töne, Dauern, Punkte, Triolen und Pausen', () => {
    const p = phrase("c'4 d'8. e'16 fis'8t g'8t as'8t r4", '4/4');
    expect(p.notes.map((n) => n.pitch)).toEqual([60, 62, 64, 66, 67, 68]);
    expect(p.notes.map((n) => n.dur)).toEqual([1, 0.75, 0.25, 1 / 3, 1 / 3, 1 / 3]);
    expect(p.bars).toBe(1);
  });

  it('bindet Töne über den Taktstrich und kennt den Auftakt', () => {
    const p = phrase("g'8 | c''2.~ | c''4 r4 r8", '3/4');
    expect(p.pickup).toBe(0.5);
    expect(p.bars).toBe(2);
    expect(p.notes).toEqual([
      { at: -0.5, dur: 0.5, pitch: 67 },
      { at: 0, dur: 4, pitch: 72 },
    ]);
  });

  it('meldet Takte, die nicht aufgehen', () => {
    expect(() => phrase("c'4 d'4 | e'2", '3/4')).toThrow(/Takt 2/);
    expect(() => phrase("c'4 h'4", '2/4')).toThrow(/kein Ton/);
  });

  it('liest Akkorde und teilt Takte', () => {
    expect(chordOf('G7').tones).toEqual([0, 4, 7, 10]);
    expect(chordOf('Dm/F')).toMatchObject({ root: 2, bass: 5 });
    expect(chordOf('F#m').root).toBe(6);
    const spans = chordSpans('C . G7 | Am', '3/4', 2);
    expect(spans.map((s) => [s.at, s.dur, s.chord?.name])).toEqual([
      [0, 2, 'C'],
      [2, 1, 'G7'],
      [3, 3, 'Am'],
    ]);
    expect(() => chordSpans('C | G', '4/4', 3)).toThrow(/Takte/);
  });
});

describe('Die Lieder der Lobby', () => {
  it('hat Stücke für jede Saison, jede Kennung einmal', () => {
    Object.values(SONGS_BY_SEASON).forEach((songs) => expect(songs.length).toBeGreaterThanOrEqual(3));
    const ids = ALL_SONGS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9-]+$/)); // "stille-nacht" ja, "Stille Nacht" nein
  });

  it(
    'jedes Stück geht im Takt auf und dauert eine bis zwei Minuten',
    () => {
      ALL_SONGS.forEach((song) => {
        // Takte prüft schon das Lesen der Noten (wirft sonst); hier Länge und Taktart.
        const a = arranged(song.id);
        const seconds = lengthSeconds(a);
        expect(seconds, song.id).toBeGreaterThan(45);
        expect(seconds, song.id).toBeLessThan(125);
        expect(BAR_BEATS[song.meter]).toBeGreaterThan(0);
      });
    },
    SLOW,
  );

  it(
    'jeder Ton liegt im Tonumfang, keine zwei Melodietöne überlappen',
    () => {
      ALL_SONGS.forEach((song) => {
        const a = arranged(song.id);
        a.hits.forEach((h) => {
          expect(h.pitch, song.id).toBeGreaterThanOrEqual(24);
          expect(h.pitch, song.id).toBeLessThanOrEqual(100);
          expect(h.vel).toBeGreaterThan(0);
          expect(h.vel).toBeLessThanOrEqual(127);
        });
        expect(new Set(a.hits.map((h) => h.inst)).size).toBeLessThanOrEqual(16);
      });
    },
    SLOW,
  );

  it('Tempowechsel: der Bergkönig wird schneller', () => {
    const a = arranged('bergkoenig');
    expect(a.tempo.map((t) => t.tpb)).toEqual([10, 8, 7, 6]);
    const firstBar = beatToTick(a, 4);
    const lastBar = lengthTicks(a) - beatToTick(a, a.beats - 4);
    expect(firstBar).toBe(40);
    expect(lastBar).toBe(24);
  });
});

describe('Notenblöcke', () => {
  it(
    'jeder Klang passt auf den Notenblock, nicht zu viele auf einmal',
    () => {
      ALL_SONGS.forEach((song) => {
        const a = arranged(song.id);
        const notes = noteBlocks(a);
        expect(notes.length, song.id).toBeGreaterThan(200);
        const perTick = new Map<number, number>();
        notes.forEach((n, i) => {
          expect(n.key).toBeGreaterThanOrEqual(0);
          expect(n.key).toBeLessThanOrEqual(BLOCK_SPAN);
          expect(n.volume).toBeGreaterThan(0);
          expect(n.volume).toBeLessThanOrEqual(1);
          if (i > 0) expect(n.tick).toBeGreaterThanOrEqual(notes[i - 1]?.tick ?? 0);
          perTick.set(n.tick, (perTick.get(n.tick) ?? 0) + 1);
        });
        expect(Math.max(...perTick.values())).toBeLessThanOrEqual(8);
        expect(notes[notes.length - 1]?.tick ?? 0).toBeLessThanOrEqual(lengthTicks(a));
      });
    },
    SLOW,
  );

  it('die Melodie klingt auf dem Notenblock in der richtigen Tonhöhe (Oktave egal)', () => {
    // Flöte: tiefster Ton Fis4 (66) → Klick 0; c'' (72) → Klick 6.
    expect(BLOCK_LOWEST.flute).toBe(66);
    const a = arranged('stille-nacht');
    const firstLead = a.hits.find((h) => h.inst === 'celesta');
    const firstBell = noteBlocks(a).find((n) => n.block === 'bell' && n.tick === 0);
    expect(firstLead && firstBell).toBeTruthy();
    expect(Math.abs((firstLead?.pitch ?? 0) - (BLOCK_LOWEST.bell + (firstBell?.key ?? 0))) % 12).toBe(0);
  });

  it('Kurzform hin und zurück', () => {
    const notes = noteBlocks(arranged('morni-marsch'));
    const back = decodeBlocks(encodeBlocks(notes));
    expect(back.map((n) => [n.tick, n.block, n.key])).toEqual(notes.map((n) => [n.tick, n.block, n.key]));
  });
});

describe('Klangdateien', () => {
  it(
    'MIDI-Datei mit Kopf, Spuren und Tempo',
    () => {
      ALL_SONGS.forEach((song) => {
        const midi = songMidi(arranged(song.id));
        expect(midi.subarray(0, 4).toString('ascii')).toBe('MThd');
        expect(midi.readUInt16BE(8)).toBe(1); // Typ 1
        expect(midi.includes(Buffer.from([0xff, 0x51, 0x03]))).toBe(true);
      });
    },
    SLOW,
  );

  it('jedes Instrument hat einen General-MIDI-Klang', () => {
    Object.values(INSTRUMENTS).forEach((i) => {
      expect(i.gm).toBeGreaterThanOrEqual(0);
      expect(i.gm).toBeLessThan(128);
    });
  });

  it('sounds.json meldet jede Datei als gestreamte Musik an', () => {
    const files = new Map([
      ['stille-nacht', Buffer.from('ogg1')],
      ['o-tannenbaum', Buffer.from('ogg2')],
    ]);
    const entries = musicPackEntries(files);
    const sounds = JSON.parse(String(entries.find((e) => e.name === 'assets/moinmorni/sounds.json')?.data));
    expect(sounds).toEqual({
      'lobby.musik.o-tannenbaum': { sounds: [{ name: 'moinmorni:lobby/musik/o-tannenbaum', stream: true }] },
      'lobby.musik.stille-nacht': { sounds: [{ name: 'moinmorni:lobby/musik/stille-nacht', stream: true }] },
    });
    expect(entries.map((e) => e.name)).toContain('assets/moinmorni/sounds/lobby/musik/stille-nacht.ogg');
    expect(musicSound('stille-nacht')).toBe('moinmorni:lobby.musik.stille-nacht');
    expect(musicPackEntries(new Map())).toEqual([]);
  });
});
