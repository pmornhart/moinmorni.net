import fs from 'node:fs';
import path from 'node:path';

/**
 * Rückbenennung (16.11.2026): Für ein paar Stunden lief der Entwicklungs-Branch unter einem Zwischen-Namen – die Adresse
 * dazu war dann doch nicht zu haben, das Netzwerk heißt wieder MoinMorni. Eine Installation aus dieser Zeit zieht beim
 * Start von selbst zurück: Datenbank-Datei, Netzwerk und Server-Namen im Motor, die Jar des Netzwerk-Plugins und die
 * Duels-Jar unter dem Zwischen-Namen auf den Servern, die Datenpakete der Lobby. Den Datenordner auf den Servern holt
 * das Plugin selbst zurück (DataFolder.java), Docker-Volumes, systemd, Wächter und /opt holt update.sh zurück. Im
 * Server-Code stehen die Zwischen-Namen nur hier.
 */

/** Zwischen-Name, wie man ihn sah (Netzwerk im Motor, Anfang der Server-Namen). */
export const INTERIM_TITLE = 'morni.net';
/** Zwischen-Name in Dateien und Ordnern (Datenbank, Datenordner der Plugins, Datenpakete). */
export const INTERIM_ID = 'morninet';
/** Jar des Netzwerk-Plugins unter dem Zwischen-Namen (in plugins/ jedes Servers). */
export const INTERIM_NETWORK_JAR = 'MorniNet.jar';
/** Jars der Spielmodi unter dem Zwischen-Namen (Modus → Datei in plugins/). */
export const INTERIM_MODE_JARS: Readonly<Record<string, string>> = { duels: 'Morni-Duels.jar' };
/** Datenpakete der Lobby unter dem Zwischen-Namen (im Ordner datapacks/ der Welt). */
export const INTERIM_LOBBY_PACKS = [`${INTERIM_ID}-lobby`, `${INTERIM_ID}-lobby-season`] as const;

/** Endungen der Datenbank-Dateien (SQLite mit WAL). */
const DB_PARTS = ['', '-wal', '-shm'] as const;

/**
 * Datenbank unter dem Zwischen-Namen übernehmen (samt -wal/-shm). Liegt sie noch da, ist sie die gültige: Diese Fassung
 * benennt sie beim Start um, es gibt sie also nur, wenn danach noch eine Zwischen-Fassung lief. true = übernommen.
 */
export function adoptInterimDatabase(file: string): boolean {
  const interim = path.join(path.dirname(file), `${INTERIM_ID}.db`);
  if (!fs.existsSync(interim)) return false;
  DB_PARTS.forEach((part) => fs.rmSync(`${file}${part}`, { force: true }));
  DB_PARTS.filter((part) => fs.existsSync(`${interim}${part}`)).forEach((part) =>
    fs.renameSync(`${interim}${part}`, `${file}${part}`),
  );
  return true;
}

/**
 * Server-Name im Motor mit dem Zwischen-Namen vorne („… Lobby“) → derselbe mit `title` vorne („MoinMorni Lobby“);
 * null = schon richtig.
 */
export function renamedServer(name: string, title: string): string | null {
  return name.startsWith(`${INTERIM_TITLE} `) ? `${title}${name.slice(INTERIM_TITLE.length)}` : null;
}
