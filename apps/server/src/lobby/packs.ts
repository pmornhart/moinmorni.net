import crypto from 'node:crypto';
import { castPack } from '@moinmorni/builder';
import type { Api } from '../app.js';

/**
 * Texturpaket der Lobby (eigene Skins der Figuren aus `packages/builder/src/cast.ts`). Der Lobby-Server bietet es
 * jedem Java-Spieler beim Betreten an (Adresse + SHA-1 in seiner server.properties); ohne Paket sähen die Figuren
 * kaputt aus.
 */

export const LOBBY_PACK_PATH = '/api/public/packs/lobby.zip';

export interface PackInfo {
  readonly bytes: Buffer;
  readonly sha1: string;
}

let cached: PackInfo | null = null;

/** Gleiche Figuren = gleiche Bytes = gleiche SHA-1 (Minecraft lädt nur bei neuer SHA-1 neu). */
export function lobbyPackInfo(): PackInfo {
  if (cached) return cached;
  const bytes = castPack();
  cached = { bytes, sha1: crypto.createHash('sha1').update(bytes).digest('hex') };
  return cached;
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
