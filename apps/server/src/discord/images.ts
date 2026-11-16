import { badRequest } from '../lib/errors.js';

/**
 * Bilder für Discord (Server-Symbol, Banner, Profilbild des Bots) kommen als „data:image/…;base64,…“ – so will Discord
 * sie haben (https://docs.discord.com/developers/reference#image-data). Hier wird geprüft, ob es wirklich ein PNG, JPG
 * oder GIF ist (an den ersten Bytes, nicht am Namen), wie groß es ist und ob ein GIF sich bewegt.
 */

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/gif';

export interface ImageData {
  readonly mime: ImageMime;
  readonly bytes: Buffer;
  /** Ein GIF mit mehreren Bildern – Discord zeigt das nur mit Server-Boost. */
  readonly animated: boolean;
  readonly dataUri: string;
}

/** Größtes Bild, das Discord annimmt (10 MB). */
export const IMAGE_MAX_BYTES = 10_485_760;
const DATA_PREFIX = 'data:';
const BASE64_MARK = ';base64,';
/** Die ersten Bytes jeder Bildart (hexadezimal): PNG „‰PNG“, JPG, GIF „GIF8“. */
const SIGNATURES: ReadonlyArray<readonly [ImageMime, Buffer]> = [
  ['image/png', Buffer.from('89504e47', 'hex')],
  ['image/jpeg', Buffer.from('ffd8ff', 'hex')],
  ['image/gif', Buffer.from('47494638', 'hex')],
];
/** „Graphic Control Extension“ – steht vor jedem Bild eines bewegten GIFs. */
const GIF_FRAME = Buffer.from('21f904', 'hex');

/** Mehr als ein Bild im GIF? */
function moving(gif: Buffer): boolean {
  const first = gif.indexOf(GIF_FRAME);
  return first >= 0 && gif.indexOf(GIF_FRAME, first + GIF_FRAME.length) >= 0;
}

/** Prüft ein Bild aus dem Panel; wirft „discord_image_invalid“ oder „discord_image_too_big“. */
export function parseImage(dataUri: string): ImageData {
  const mark = dataUri.indexOf(BASE64_MARK);
  if (!dataUri.startsWith(DATA_PREFIX) || mark < 0) throw badRequest('discord_image_invalid');
  const bytes = Buffer.from(dataUri.slice(mark + BASE64_MARK.length), 'base64');
  if (bytes.length > IMAGE_MAX_BYTES) throw badRequest('discord_image_too_big');
  const mime = SIGNATURES.find(([, sig]) => bytes.subarray(0, sig.length).equals(sig))?.[0];
  if (!mime) throw badRequest('discord_image_invalid');
  return {
    mime,
    bytes,
    animated: mime === 'image/gif' && moving(bytes),
    dataUri: `${DATA_PREFIX}${mime}${BASE64_MARK}${bytes.toString('base64')}`,
  };
}
