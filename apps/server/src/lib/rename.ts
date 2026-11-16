import fs from 'node:fs';
import path from 'node:path';
import { NETWORK_TITLE } from '@morninet/shared';

/**
 * Umbenennung in morni.net (16.11.2026): Bis dahin hieß das Netzwerk anders. Bestehende Installationen ziehen beim
 * Start von selbst um – Datenbank-Datei, Netzwerk und Server-Namen im Motor, die Jar des Netzwerk-Plugins und alte
 * Jars der Spielmodi auf den Servern, die Datenpakete der Lobby. Den Datenordner auf den Servern zieht das Plugin
 * selbst um, Docker-Volumes, systemd und /opt zieht update.sh um. Nur hier steht der frühere Name.
 */

/** Früherer Name, wie man ihn sah (Netzwerk im Motor, Anfang der Server-Namen). */
export const OLD_TITLE = 'MoinMorni';
/** Früherer Name in Dateien und Ordnern. */
export const OLD_ID = 'moinmorni';
/** Jar des Netzwerk-Plugins unter dem früheren Namen (in plugins/ jedes Servers). */
export const OLD_NETWORK_JAR = `${OLD_TITLE}-Network.jar`;
/** Jars der Spielmodi unter früherem Namen (Modus → Datei in plugins/). */
export const OLD_MODE_JARS: Readonly<Record<string, string>> = { duels: `${OLD_TITLE}-Duels.jar` };
/** Datenpakete der Lobby unter dem früheren Namen (im Ordner datapacks/ der Welt). */
export const OLD_LOBBY_PACKS = [`${OLD_ID}-lobby`, `${OLD_ID}-lobby-season`] as const;

/** Endungen der Datenbank-Dateien (SQLite mit WAL). */
const DB_PARTS = ['', '-wal', '-shm'] as const;

/**
 * Datenbank unter dem früheren Namen übernehmen (samt -wal/-shm). Liegt sie noch da, ist sie die gültige: Neue
 * Fassungen benennen sie beim Start um, sie gibt es also nur, wenn danach noch eine alte Fassung lief (Rückweg nach
 * einem missglückten Update). true = umgezogen.
 */
export function adoptOldDatabase(file: string): boolean {
  const old = path.join(path.dirname(file), `${OLD_ID}.db`);
  if (!fs.existsSync(old)) return false;
  DB_PARTS.forEach((part) => fs.rmSync(`${file}${part}`, { force: true }));
  DB_PARTS.filter((part) => fs.existsSync(`${old}${part}`)).forEach((part) =>
    fs.renameSync(`${old}${part}`, `${file}${part}`),
  );
  return true;
}

/** Netzwerk im Motor: unter dem neuen oder (bis zum Umzug) dem früheren Namen. */
export const isOurNetwork = (n: { readonly name: string }): boolean =>
  n.name === NETWORK_TITLE || n.name === OLD_TITLE;

/** Server-Name im Motor mit dem früheren Namen vorne („… Lobby“) → neuer Name; null = schon richtig. */
export function renamedServer(name: string): string | null {
  return name.startsWith(`${OLD_TITLE} `) ? `${NETWORK_TITLE}${name.slice(OLD_TITLE.length)}` : null;
}
