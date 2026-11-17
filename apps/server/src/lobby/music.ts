import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  arrange,
  encodeBlocks,
  lengthTicks,
  musicSound,
  noteBlocks,
  songById,
  ALL_SONGS,
  type Arrangement,
} from '@moinmorni/builder';
import { songSettingKey, songsOf } from '@moinmorni/shared';
import type { Stores } from '../panel/stores.js';

/**
 * Lobbymusik für den Lobby-Server (Nachricht `lobby-music`): Einstellungen aus dem Panel und die Stücke der aktuellen
 * Saison – je Stück die Notenblock-Fassung (für alle ohne Paket und für Bedrock) und, wenn es eine Klangdatei gibt,
 * der Name des Geräuschs im Lobby-Paket. Die Klangdateien liegen unter `apps/server/musik/` (im Image neben `dist/`).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = 'lieder.json';
const TICKS_PER_SECOND = 20;
const DEFAULT_VOLUME = 70;
const DEFAULT_QUIET = 40;
const DEFAULT_PAUSE = 4;

/** Ordner mit den Klangdateien: `MM_MUSIC_DIR`, sonst neben `dist/` bzw. `src/`. */
export function musicDir(): string | null {
  const env = process.env['MM_MUSIC_DIR'];
  const candidates = env ? [env] : [path.resolve(here, '../musik'), path.resolve(here, '../../musik')];
  return candidates.find((dir) => existsSync(path.join(dir, MANIFEST))) ?? null;
}

interface ManifestEntry {
  readonly fingerprint: string;
  readonly seconds: number;
  readonly bytes: number;
}

const files: { loaded: Map<string, Buffer> | null; manifest: Record<string, ManifestEntry> } = {
  loaded: null,
  manifest: {},
};

/** Alle vorhandenen Klangdateien (Lied → Bytes), einmal gelesen. */
export function musicFiles(): ReadonlyMap<string, Buffer> {
  if (files.loaded) return files.loaded;
  const dir = musicDir();
  const loaded = new Map<string, Buffer>();
  if (dir) {
    files.manifest = JSON.parse(readFileSync(path.join(dir, MANIFEST), 'utf8')) as Record<
      string,
      ManifestEntry
    >;
    ALL_SONGS.map((s) => s.id)
      .filter((id) => existsSync(path.join(dir, `${id}.ogg`)))
      .forEach((id) => loaded.set(id, readFileSync(path.join(dir, `${id}.ogg`))));
  }
  files.loaded = loaded;
  return loaded;
}

const arrangements = new Map<string, Arrangement>();
const encoded = new Map<string, number[]>();

function arrangementOf(id: string): Arrangement | null {
  const cached = arrangements.get(id);
  if (cached) return cached;
  const song = songById(id);
  if (!song) return null;
  const a = arrange(song);
  arrangements.set(id, a);
  return a;
}

function blocksOf(id: string, a: Arrangement): number[] {
  const cached = encoded.get(id);
  if (cached) return cached;
  const data = encodeBlocks(noteBlocks(a));
  encoded.set(id, data);
  return data;
}

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export interface MusicSongBody {
  readonly id: string;
  readonly title: { readonly de: string; readonly en: string };
  /** Länge der Notenblock-Fassung in Ticks. */
  readonly ticks: number;
  /** Geräusch im Lobby-Paket (null = keine Klangdatei, nur Notenblöcke). */
  readonly sound: string | null;
  /** Länge der Klangdatei in Ticks. */
  readonly soundTicks: number;
  /** Notenblöcke: je vier Zahlen (Ticks seit dem vorigen, Klang, Klick, Lautstärke in %). */
  readonly notes: readonly number[];
}

/** Die Nachricht `lobby-music` für den Lobby-Server. */
export function lobbyMusicBody(stores: Stores): { t: 'lobby-music' } & Record<string, unknown> {
  const l = stores.settings('lobby');
  const season = String(l['season'] ?? 'none');
  const available = musicFiles();
  const songs: MusicSongBody[] = songsOf(season)
    .filter((info) => l[songSettingKey(info.id)] !== false)
    .flatMap((info) => {
      const a = arrangementOf(info.id);
      if (!a) return [];
      const ticks = lengthTicks(a);
      const seconds = files.manifest[info.id]?.seconds;
      const sound = available.has(info.id) ? musicSound(info.id) : null;
      return [
        {
          id: info.id,
          title: info.title,
          ticks,
          sound,
          soundTicks: seconds ? Math.round(seconds * TICKS_PER_SECOND) : ticks,
          notes: blocksOf(info.id, a),
        },
      ];
    });
  return {
    t: 'lobby-music',
    on: l['music'] !== false,
    volume: numberOr(l['musicVolume'], DEFAULT_VOLUME),
    quiet: numberOr(l['musicQuiet'], DEFAULT_QUIET),
    pause: numberOr(l['musicPause'], DEFAULT_PAUSE),
    season,
    songs,
  };
}
