import crypto from 'node:crypto';
import { ANGEL_PACK_ID, fishPack } from '@moinmorni/builder';
import { ANGEL_FISH } from '@moinmorni/shared';
import type { Api } from '../app.js';
import { patchProperties, readProperty } from '../lobby/world.js';
import type { MotorClient } from '../motor/client.js';
import { readServerFile, writeServerFile } from '../motor/files.js';

/**
 * Das Angelkönig-Paket: eigene Zeichnungen aller Fische (`packages/builder/src/fische/`). Der Server von Angelkönig
 * bietet es jedem Java-Spieler beim Betreten an (Adresse, SHA-1 und feste Kennung in seiner server.properties, nie
 * Pflicht); der Proxy nimmt es beim Verlassen wieder ab. Wer ablehnt, auf einer älteren Version oder auf Bedrock spielt,
 * sieht die gewohnten Minecraft-Fische – das Paket ändert nur Gegenstände mit dem Namen einer Art.
 */

export const ANGEL_PACK_PATH = '/api/public/packs/angelkoenig.zip';
/** Server des Spielmodus (wie `server` in `DEFAULT_MODES`). */
export const ANGEL_MODE = 'angelkoenig';

export interface AngelPackInfo {
  readonly bytes: Buffer;
  readonly sha1: string;
}

const cache: { pack: AngelPackInfo | null } = { pack: null };

/** Gleiche Zeichnungen = gleiche Bytes = gleiche SHA-1 (Minecraft lädt nur bei neuer SHA-1 neu). */
export function angelPackInfo(): AngelPackInfo {
  if (cache.pack) return cache.pack;
  const bytes = fishPack(ANGEL_FISH.map((f) => ({ id: f.id, base: f.base })));
  cache.pack = { bytes, sha1: crypto.createHash('sha1').update(bytes).digest('hex') };
  return cache.pack;
}

/** Öffentliche Adresse des Pakets, nur mit eigener Domain (Minecraft lädt nur von außen erreichbare Adressen). */
export function angelPackUrl(domain: string): string | null {
  const host = domain.trim();
  return host ? `https://${host}${ANGEL_PACK_PATH}` : null;
}

const PROMPT = {
  text: 'Jeder Fisch mit eigenem Aussehen – dafür unser Paket. / Every fish with its own look – needs our pack.',
  color: 'aqua',
};

const PROPERTIES_FILE = 'server.properties';

/**
 * server.properties von Angelkönig mit unserem Paket. Ohne Adresse (keine Domain) nimmt es nur unser eigenes Paket
 * wieder heraus – ein von Hand eingetragenes anderes Paket bleibt.
 */
export function angelPackProperties(
  text: string,
  url: string | null,
  sha1: string,
): { text: string; changed: boolean } {
  if (url) {
    return patchProperties(text, {
      'resource-pack': url,
      'resource-pack-sha1': sha1,
      'resource-pack-id': ANGEL_PACK_ID,
      'require-resource-pack': 'false',
      'resource-pack-prompt': JSON.stringify(PROMPT),
    });
  }
  if (readProperty(text, 'resource-pack-id') !== ANGEL_PACK_ID) return { text, changed: false };
  return patchProperties(text, {
    'resource-pack': '',
    'resource-pack-sha1': '',
    'resource-pack-id': '',
    'resource-pack-prompt': '',
  });
}

/** server.properties des Angelkönig-Servers über den Motor anpassen; true = geändert (gilt nach dem nächsten Start). */
export async function offerAngelPack(
  motor: Pick<MotorClient, 'request'>,
  serverId: string,
  domain: string,
): Promise<boolean> {
  const next = angelPackProperties(
    (await readServerFile(motor, serverId, PROPERTIES_FILE)) ?? '',
    angelPackUrl(domain),
    angelPackInfo().sha1,
  );
  if (!next.changed) return false;
  await writeServerFile(motor, serverId, PROPERTIES_FILE, next.text);
  return true;
}

export function registerAngelPackRoutes(app: Api): void {
  app.get(ANGEL_PACK_PATH, async (_request, reply) => {
    const pack = angelPackInfo();
    return reply
      .header('content-type', 'application/zip')
      .header('cache-control', 'public, max-age=300')
      .header('etag', `"${pack.sha1}"`)
      .send(pack.bytes);
  });
}
