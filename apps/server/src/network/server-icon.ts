import type { FastifyBaseLogger } from 'fastify';
import type { MotorClient } from '../motor/client.js';

/**
 * Bild in der Serverliste von Minecraft: das MoinMorni-Wappen (grüner Schild mit goldener Burg, wie apps/web/public/
 * favicon.svg), 64 × 64 Pixel. Der Proxy zeigt es allen Spielern; Velocity liest `server-icon.png` beim Start.
 * Ein eigenes Bild (im Panel beim Proxy unter Einstellungen → Server-Bild) wird nie überschrieben.
 */
const ICON_PNG_BASE64 =
  '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';

export const SERVER_ICON = Buffer.from(ICON_PNG_BASE64, 'base64');

/** Hat der Proxy noch kein Bild, bekommt er das Wappen. true = neu aufgespielt (gilt nach dem nächsten Neustart). */
export async function ensureServerIcon(
  motor: Pick<MotorClient, 'request' | 'upload'>,
  proxyId: string,
  log: FastifyBaseLogger,
): Promise<boolean> {
  const detail = await motor.request<{ readonly hasIcon?: boolean } | undefined>(
    'GET',
    `/api/servers/${proxyId}`,
  );
  if (!detail || detail.hasIcon) return false;
  await motor.upload(proxyId, '', 'server-icon.png', SERVER_ICON);
  log.info('Netzwerk: MoinMorni-Wappen als Bild in der Serverliste aufgespielt');
  return true;
}
