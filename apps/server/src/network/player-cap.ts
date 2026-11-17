import { SERVER_MAX_PLAYERS } from '@moinmorni/shared';
import { patchProperties, readProperty } from '../lobby/world.js';
import type { MotorClient } from '../motor/client.js';
import { readServerFile, writeServerFile } from '../motor/files.js';

/**
 * Höchstzahl der Spielmodi hinter dem Proxy: Minecraft legt neue Server mit „max-players=20“ an – ein Modus mit
 * Höchstzahl 40 im Panel hätte dann den 21. Spieler abgewiesen. Wie viele hineindürfen, entscheiden Proxy und Hub.
 * Lobby, Wartungs-Lobby und Bau-Server bringen den Wert in ihren eigenen server.properties mit (`lobbyProperties`,
 * `wartungProperties`, `buildProperties`); die Spielmodi bekommen ihn hier – neue vor dem ersten Start, bestehende
 * einmal (danach steht er drin). Ein höherer Wert bleibt, wie er ist.
 */

const PROPERTIES_FILE = 'server.properties';
const KEY = 'max-players';

/** Steht weniger als `SERVER_MAX_PLAYERS` drin (oder nichts), kommt er hinein; sonst bleibt alles, wie es ist. */
export function raisePlayerCap(text: string): { text: string; changed: boolean } {
  const now = Number(readProperty(text, KEY) ?? Number.NaN);
  if (Number.isInteger(now) && now >= SERVER_MAX_PLAYERS) return { text, changed: false };
  return patchProperties(text, { [KEY]: String(SERVER_MAX_PLAYERS) });
}

/** server.properties eines Modus-Servers über den Motor anpassen; true = geändert (gilt nach dem nächsten Start). */
export async function openPlayerCap(motor: Pick<MotorClient, 'request'>, serverId: string): Promise<boolean> {
  const next = raisePlayerCap((await readServerFile(motor, serverId, PROPERTIES_FILE)) ?? '');
  if (!next.changed) return false;
  await writeServerFile(motor, serverId, PROPERTIES_FILE, next.text);
  return true;
}
