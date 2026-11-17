import type { Song } from '../arrangement.js';
import { ALLTAG } from './alltag.js';
import { HALLOWEEN } from './halloween.js';
import { OSTERN } from './ostern.js';
import { WIESN } from './wiesn.js';
import { WINTER } from './winter.js';

/** Die Saisons der Lobby-Deko (wie im Panel unter Lobby → Saison-Deko); „none“ = Alltag. */
export type MusicSeason = 'none' | 'wiesn' | 'winter' | 'easter' | 'halloween';

/** Alle Lieder der Lobby je Saison – Reihenfolge = Reihenfolge im Panel. */
export const SONGS_BY_SEASON: Readonly<Record<MusicSeason, readonly Song[]>> = {
  none: ALLTAG,
  wiesn: WIESN,
  winter: WINTER,
  easter: OSTERN,
  halloween: HALLOWEEN,
};

export const ALL_SONGS: readonly Song[] = Object.values(SONGS_BY_SEASON).flat();

export function songById(id: string): Song | undefined {
  return ALL_SONGS.find((s) => s.id === id);
}
