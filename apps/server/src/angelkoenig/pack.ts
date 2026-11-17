import crypto from 'node:crypto';
import { ANGEL_PACK_ID, fishPack } from '@moinmorni/builder';
import { ANGEL_CLOTHES, ANGEL_FISH } from '@moinmorni/shared';
import type { Api } from '../app.js';
import { patchProperties, readProperty } from '../lobby/world.js';
import type { MotorClient } from '../motor/client.js';
import { readServerFile, writeServerFile } from '../motor/files.js';

/**
 * Das Angelkönig-Paket: eigene Zeichnungen aller Fische (`packages/builder/src/fische/`) und eigene 3D-Hüte und
 * Kleidung aus dem Kleiderschrank (`packages/builder/src/kleidung/`). Der Server von Angelkönig
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
  const bytes = fishPack(
    ANGEL_FISH.map((f) => ({ id: f.id, base: f.base })),
    ANGEL_CLOTHES.map((c) => ({ id: c.id, base: c.base })),
  );
  cache.pack = { bytes, sha1: crypto.createHash('sha1').update(bytes).digest('hex') };
  return cache.pack;
}

/** Öffentliche Adresse des Pakets, nur mit eigener Domain (Minecraft lädt nur von außen erreichbare Adressen). */
export function angelPackUrl(domain: string): string | null {
  const host = domain.trim();
  return host ? `https://${host}${ANGEL_PACK_PATH}` : null;
}

const PROMPT = {
  text: 'Fische, Hüte und Kleidung mit eigenem Aussehen – dafür unser Paket. / Fish, hats and clothes with their own look – needs our pack.',
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

/** Datei, in der Angelkönig ab 0.2.1 das Paket liest (bietet es dann selbst beim Verbinden an). */
export const ANGEL_PACK_FILE = 'plugins/MorniAngelkoenig/paket.json';
/** Legt Angelkönig ab 0.2.1 beim Start an: „ich biete das Paket selbst an“. */
export const ANGEL_PACK_MARKER = 'plugins/MorniAngelkoenig/paket-angebot';

/** Inhalt von `paket.json` (ohne Adresse: kein Paket). */
export function angelPackJson(url: string | null, sha1: string): string {
  const pack = url ? { url, sha1, id: ANGEL_PACK_ID, prompt: PROMPT.text } : {};
  return `${JSON.stringify(pack, null, 2)}\n`;
}

/**
 * Paket beim Angelkönig-Server eintragen; true = geändert (gilt nach dem nächsten Start).
 *
 * Angelkönig ab 0.2.1 (Datei `paket-angebot` liegt da) bietet das Paket selbst beim Verbinden an – nur so erfährt es,
 * wer es geladen hat, und kann Hüte und Kleidung jedem in seiner Fassung zeigen. Dafür bekommt es `paket.json`, und
 * unser Paket kommt aus der server.properties heraus (sonst lädt der Client es zweimal). Ältere Fassungen bekommen es
 * wie bisher über die server.properties.
 */
export async function offerAngelPack(
  motor: Pick<MotorClient, 'request'>,
  serverId: string,
  domain: string,
): Promise<boolean> {
  const url = angelPackUrl(domain);
  const { sha1 } = angelPackInfo();
  const selfOffer = (await readServerFile(motor, serverId, ANGEL_PACK_MARKER)) !== null;
  const props = angelPackProperties(
    (await readServerFile(motor, serverId, PROPERTIES_FILE)) ?? '',
    selfOffer ? null : url,
    sha1,
  );
  if (props.changed) await writeServerFile(motor, serverId, PROPERTIES_FILE, props.text);
  if (!selfOffer) return props.changed;
  const wanted = angelPackJson(url, sha1);
  const current = await readServerFile(motor, serverId, ANGEL_PACK_FILE);
  if (current === wanted) return props.changed;
  await writeServerFile(motor, serverId, ANGEL_PACK_FILE, wanted);
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
