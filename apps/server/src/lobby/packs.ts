import crypto from 'node:crypto';
import { furniturePack } from '@moinmorni/builder';
import type { Api } from '../app.js';

/**
 * Ressourcenpaket der Lobby: eigene Möbel (Stühle, Eckbank, Tische, Bierbank, Steinkrüge – `packages/builder/src/
 * furniture.ts`). Der Lobby-Server bietet es jedem Java-Spieler beim Betreten an (Adresse, SHA-1 und feste Kennung in
 * seiner server.properties); wer ablehnt oder auf Bedrock spielt, sieht einfache Holzstufen.
 */

export const LOBBY_PACK_PATH = '/api/public/packs/lobby.zip';

export interface PackInfo {
  readonly bytes: Buffer;
  readonly sha1: string;
}

const cache: { pack: PackInfo | null } = { pack: null };

/** Gleiche Möbel = gleiche Bytes = gleiche SHA-1 (Minecraft lädt nur bei neuer SHA-1 neu). */
export function lobbyPackInfo(): PackInfo {
  if (cache.pack) return cache.pack;
  const bytes = furniturePack();
  cache.pack = { bytes, sha1: crypto.createHash('sha1').update(bytes).digest('hex') };
  return cache.pack;
}

/** Öffentliche Adresse des Pakets, nur mit eigener Domain (Minecraft lädt nur von außen erreichbare Adressen). */
export function lobbyPackUrl(domain: string): string | null {
  const host = domain.trim();
  return host ? `https://${host}${LOBBY_PACK_PATH}` : null;
}

export function registerPackRoutes(app: Api): void {
  app.get(LOBBY_PACK_PATH, async (_request, reply) => {
    const pack = lobbyPackInfo();
    return reply
      .header('content-type', 'application/zip')
      .header('cache-control', 'public, max-age=300')
      .header('etag', `"${pack.sha1}"`)
      .send(pack.bytes);
  });
}
