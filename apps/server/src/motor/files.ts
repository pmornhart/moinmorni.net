import { MotorError, type MotorClient } from './client.js';

/** Textdateien im Ordner eines Servers über den Motor (hub.json, server.properties, Einstellungen der Modi …). */

/** Inhalt einer Textdatei; null = gibt es nicht (oder der Motor kennt den Server nicht). */
export async function readServerFile(
  motor: Pick<MotorClient, 'request'>,
  serverId: string,
  file: string,
): Promise<string | null> {
  try {
    const r = await motor.request<{ content: string }>(
      'GET',
      `/api/servers/${serverId}/files/content?path=${encodeURIComponent(file)}`,
    );
    return r.content;
  } catch (err) {
    if (err instanceof MotorError) return null;
    throw err;
  }
}

export function writeServerFile(
  motor: Pick<MotorClient, 'request'>,
  serverId: string,
  file: string,
  content: string,
): Promise<void> {
  return motor.request('PUT', `/api/servers/${serverId}/files/content`, { path: file, content });
}

/**
 * Dateien oder Ordner eines Servers löschen (der Motor legt sie 7 Tage in seinen Papierkorb). Was es nicht gibt, wird
 * übersprungen; zurück kommt, wie viele es waren.
 */
export async function removeServerFiles(
  motor: Pick<MotorClient, 'request'>,
  serverId: string,
  paths: readonly string[],
): Promise<number> {
  const r = await motor.request<{ moved?: number }>('POST', `/api/servers/${serverId}/files/delete`, { paths });
  return r?.moved ?? 0;
}
