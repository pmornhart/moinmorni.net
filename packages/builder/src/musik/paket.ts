import type { ZipEntry } from '../png.js';

/**
 * Die Klangdateien der Lobbymusik im Lobby-Paket: `assets/moinmorni/sounds.json` meldet je Lied ein Geräusch
 * `moinmorni:lobby.musik.<lied>` an, die Datei liegt unter `assets/moinmorni/sounds/lobby/musik/<lied>.ogg`.
 * `stream` = Minecraft liest sie beim Spielen Stück für Stück (lange Musik, nichts wird vorab geladen).
 */

export const MUSIC_NS = 'moinmorni';
const JSON_INDENT = 2;

/** Name des Geräuschs, das das Plugin abspielt. */
export function musicSound(id: string): string {
  return `${MUSIC_NS}:lobby.musik.${id}`;
}

export function musicSoundsJson(ids: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(
    [...ids]
      .sort()
      .map((id) => [
        `lobby.musik.${id}`,
        { sounds: [{ name: `${MUSIC_NS}:lobby/musik/${id}`, stream: true }] },
      ]),
  );
}

/** Einträge fürs Paket: sounds.json und je Lied die .ogg-Datei. */
export function musicPackEntries(files: ReadonlyMap<string, Buffer>): ZipEntry[] {
  const ids = [...files.keys()].sort();
  if (!ids.length) return [];
  return [
    {
      name: `assets/${MUSIC_NS}/sounds.json`,
      data: Buffer.from(`${JSON.stringify(musicSoundsJson(ids), null, JSON_INDENT)}\n`),
    },
    ...ids.map((id) => ({
      name: `assets/${MUSIC_NS}/sounds/lobby/musik/${id}.ogg`,
      data: files.get(id) ?? Buffer.alloc(0),
    })),
  ];
}
