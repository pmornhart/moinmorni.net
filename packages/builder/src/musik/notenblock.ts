/* eslint-disable ts-patterns/no-magic-numbers -- note-block pitch maths: two octaves per block, 24 clicks */
import { BLOCK_LOWEST, BLOCK_SPAN, DRUMS, INSTRUMENTS, NOTE_BLOCKS, type NoteBlock } from './band.js';
import { beatToTick, type Arrangement } from './arrangement.js';

/**
 * Die Notenblock-Fassung eines Lieds: jeder Ton wird zu einem oder mehreren Notenblock-Klängen (Instrument, Klick
 * 0–24, Lautstärke) auf einem Minecraft-Tick. So spielt das Lobby-Plugin die Musik für alle ohne Paket und für
 * Bedrock – mit Minecrafts eigenen Klängen.
 */

export interface BlockNote {
  readonly tick: number;
  readonly block: NoteBlock;
  /** Klick am Notenblock 0–24 (12 = Grundton, Tonhöhe 1,0). */
  readonly key: number;
  /** Lautstärke 0–1. */
  readonly volume: number;
}

/** Höchstens so viele Klänge auf einem Tick (sonst wird es matschig) – die leisesten fallen weg. */
const MAX_PER_TICK = 8;
const MAX_PER_BLOCK = 4;
const QUIET = 0.04;

/** Klick (0–24) für einen MIDI-Ton – um Oktaven verschoben, bis er auf den Notenblock passt. */
export function blockKey(block: NoteBlock, pitch: number): number {
  const low = BLOCK_LOWEST[block];
  const fold = (p: number): number => {
    if (p < low) return fold(p + 12);
    if (p > low + BLOCK_SPAN) return fold(p - 12);
    return p;
  };
  return fold(pitch) - low;
}

/** Tonhöhe, die Minecraft für einen Klick spielt (0,5 – 2,0). */
export function blockPitch(key: number): number {
  return 2 ** ((key - 12) / 12);
}

export function noteBlocks(a: Arrangement): BlockNote[] {
  const all = a.hits.flatMap((h): BlockNote[] => {
    const tick = Math.max(0, beatToTick(a, h.at));
    const velocity = h.vel / 127;
    if (h.inst === 'drums') {
      const d = h.drum ? DRUMS[h.drum] : undefined;
      if (!d) return [];
      const key = Math.max(0, Math.min(24, Math.round(12 + 12 * Math.log2(d.pitch))));
      return [{ tick, block: d.block, key, volume: velocity * d.level }];
    }
    return INSTRUMENTS[h.inst].blocks.map((layer) => ({
      tick,
      block: layer.block,
      key: blockKey(layer.block, h.pitch),
      volume: velocity * layer.level,
    }));
  });
  const byTick = new Map<number, BlockNote[]>();
  all
    .filter((n) => n.volume >= QUIET)
    .forEach((n) => {
      const list = byTick.get(n.tick) ?? [];
      // Gleicher Klang, gleicher Ton auf demselben Tick: nur einmal, mit der größeren Lautstärke.
      const twin = list.findIndex((o) => o.block === n.block && o.key === n.key);
      if (twin >= 0) list[twin] = (list[twin]?.volume ?? 0) >= n.volume ? (list[twin] as BlockNote) : n;
      else list.push(n);
      byTick.set(n.tick, list);
    });
  return [...byTick.keys()]
    .sort((x, y) => x - y)
    .flatMap((tick) => {
      const list = [...(byTick.get(tick) ?? [])].sort((x, y) => y.volume - x.volume);
      const perBlock = new Map<NoteBlock, number>();
      return list
        .filter((n) => {
          const count = (perBlock.get(n.block) ?? 0) + 1;
          perBlock.set(n.block, count);
          return count <= MAX_PER_BLOCK;
        })
        .slice(0, MAX_PER_TICK);
    });
}

/**
 * Kurz für den Hub: je Klang vier Zahlen – Ticks seit dem vorigen Klang, Notenblock (Nummer in NOTE_BLOCKS), Klick,
 * Lautstärke in Prozent.
 */
export function encodeBlocks(notes: readonly BlockNote[]): number[] {
  return notes.reduce<{ last: number; out: number[] }>(
    (acc, n) => {
      acc.out.push(
        n.tick - acc.last,
        NOTE_BLOCKS.indexOf(n.block),
        n.key,
        Math.max(1, Math.round(n.volume * 100)),
      );
      return { last: n.tick, out: acc.out };
    },
    { last: 0, out: [] },
  ).out;
}

/** Zurück aus der Kurzform (für Tests und das Plugin-Gegenstück). */
export function decodeBlocks(data: readonly number[]): BlockNote[] {
  const out: BlockNote[] = [];
  let tick = 0;
  Array.from({ length: Math.floor(data.length / 4) }, (_, i) => i * 4).forEach((i) => {
    tick += data[i] ?? 0;
    out.push({
      tick,
      block: NOTE_BLOCKS[data[i + 1] ?? 0] ?? 'harp',
      key: data[i + 2] ?? 12,
      volume: (data[i + 3] ?? 0) / 100,
    });
  });
  return out;
}
