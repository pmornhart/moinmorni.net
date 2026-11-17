import type { MotorClient } from '../motor/client.js';
import { readServerFile, writeServerFile } from '../motor/files.js';
import { withoutOwnPack } from '../lobby/world.js';

/**
 * Angelkönig und das Netzwerk-Paket: Fische, Hüte und Kleidung stecken im Netzwerk-Paket (`packs/netz.ts`), das der
 * Proxy einmal beim Betreten anbietet. Angelkönig bietet darum selbst nichts mehr an.
 *
 * Angelkönig ab 0.2.1 liest `paket.json` (und hat `paket-angebot` angelegt). Wir schreiben dort `{"netz": true}`:
 * - 0.2.1 findet darin keine Adresse und bietet nichts an (zeigt Kleidung dann allen ohne Paket – wie bei Bedrock);
 * - ab 0.2.2 heißt es „das Paket kommt vom Netzwerk“: Ob jemand es geladen hat, steht in den Metadaten
 *   `moinmorni:paket` des Spielers (setzt das Netzwerk-Plugin aus dem Profil), so zeigt Angelkönig jedem die
 *   Kleidung in seiner Fassung.
 * Ältere Fassungen hatten das Paket in der server.properties – das kommt heraus.
 */

/** Server des Spielmodus (wie `server` in `DEFAULT_MODES`). */
export const ANGEL_MODE = 'angelkoenig';
export const ANGEL_PACK_FILE = 'plugins/MorniAngelkoenig/paket.json';
/** Legt Angelkönig ab 0.2.1 beim Start an: „ich lese paket.json“. */
export const ANGEL_PACK_MARKER = 'plugins/MorniAngelkoenig/paket-angebot';
/** Inhalt von `paket.json`: Das Paket kommt vom Netzwerk. */
export const ANGEL_PACK_JSON = `${JSON.stringify({ netz: true }, null, 2)}\n`;

const PROPERTIES_FILE = 'server.properties';

/** Server-eigenes Paket eines Spielmodus entfernen (alle Modi; bei Angelkönig dazu `paket.json`). true = geändert. */
export async function dropServerPack(
  motor: Pick<MotorClient, 'request'>,
  serverId: string,
  member: string,
): Promise<boolean> {
  const current = (await readServerFile(motor, serverId, PROPERTIES_FILE)) ?? '';
  const props = withoutOwnPack(current);
  if (props.changed) await writeServerFile(motor, serverId, PROPERTIES_FILE, props.text);
  if (member !== ANGEL_MODE) return props.changed;
  if ((await readServerFile(motor, serverId, ANGEL_PACK_MARKER)) === null) return props.changed;
  if ((await readServerFile(motor, serverId, ANGEL_PACK_FILE)) === ANGEL_PACK_JSON) return props.changed;
  await writeServerFile(motor, serverId, ANGEL_PACK_FILE, ANGEL_PACK_JSON);
  return true;
}
