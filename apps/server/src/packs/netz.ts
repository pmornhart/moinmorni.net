import crypto from 'node:crypto';
import { musicPackEntries, netzPack } from '@moinmorni/builder';
import { ANGEL_CLOTHES, ANGEL_FISH } from '@moinmorni/shared';
import type { Api } from '../app.js';
import { musicFiles } from '../lobby/music.js';

/**
 * Das Netzwerk-Paket (`packages/builder/src/netzpaket.ts`): Möbel, Brunnen, Trachten, Christbaumkugeln, Ostereier,
 * Fische, Kleidung und die Lobbymusik in einem Ressourcenpaket. Der Proxy bietet es jedem Java-Spieler einmal beim
 * Betreten des Netzwerks an (zusammen mit dem kleinen Abzeichen-Paket, `badges/pack.ts`) und nimmt es nie wieder ab –
 * kein Laden mehr beim Wechsel zwischen Lobby und Spielmodi. Kein Spielserver bietet ein eigenes Paket an.
 */

export const NETZ_PACK_PATH = '/api/public/packs/netz.zip';
/** Frühere Pfade (Lobby- und Angelkönig-Paket): liefern jetzt das Netzwerk-Paket. */
const OLD_PATHS = ['/api/public/packs/lobby.zip', '/api/public/packs/angelkoenig.zip'] as const;

export interface PackInfo {
  readonly bytes: Buffer;
  readonly sha1: string;
}

const cache: { pack: PackInfo | null } = { pack: null };

/** Gleicher Inhalt = gleiche Bytes = gleiche SHA-1 (Minecraft lädt nur bei neuer SHA-1 neu). */
export function netzPackInfo(): PackInfo {
  if (cache.pack) return cache.pack;
  const bytes = netzPack({
    fish: ANGEL_FISH.map((f) => ({ id: f.id, base: f.base })),
    clothes: ANGEL_CLOTHES.map((c) => ({ id: c.id, base: c.base })),
    extra: musicPackEntries(musicFiles()),
  });
  cache.pack = { bytes, sha1: crypto.createHash('sha1').update(bytes).digest('hex') };
  return cache.pack;
}

/**
 * Öffentliche Adresse des Pakets, nur mit eigener Domain (Minecraft lädt nur von außen erreichbare Adressen). Die
 * SHA-1 hängt hinten dran, damit kein Zwischenspeicher unterwegs ein altes Paket liefert.
 */
export function netzPackUrl(domain: string, sha1: string): string | null {
  const host = domain.trim();
  return host ? `https://${host}${NETZ_PACK_PATH}?v=${sha1}` : null;
}

export function registerNetzPackRoutes(app: Api): void {
  [NETZ_PACK_PATH, ...OLD_PATHS].forEach((route) =>
    app.get(route, async (_request, reply) => {
      const pack = netzPackInfo();
      return reply
        .header('content-type', 'application/zip')
        .header('cache-control', 'public, max-age=300')
        .header('etag', `"${pack.sha1}"`)
        .send(pack.bytes);
    }),
  );
}
