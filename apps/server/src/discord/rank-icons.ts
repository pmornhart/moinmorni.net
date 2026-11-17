import crypto from 'node:crypto';
import { Picture } from '@moinmorni/builder';
import { drawBadgeTile, type Role } from '@moinmorni/shared';
import type { Stores } from '../panel/stores.js';

/**
 * Ränge in Discord wie im Spiel: Farbe aus der Rolle, und – wo Discord Rollen-Symbole erlaubt (Funktion
 * „ROLE_ICONS“, ab Boost-Stufe 2) – das Abzeichen als Bild neben dem Namen. Discord zeigt Rollen-Symbole quadratisch
 * und klein (etwa 20 Pixel), darum die Kachel aus packages/shared/src/badges.ts (`drawBadgeTile`: goldener Rahmen, Ring
 * in der Rangfarbe, Pixel-Symbol – die Abzeichen von MorniCraft ohne Namen); der Rang-Name steht in Discord als
 * Rollenname daneben. Ohne Boost (oder mit ausgeschalteten Abzeichen) bleibt das Symbol im Namen: „⚔ Moderator“.
 * https://docs.discord.com/developers/topics/permissions#role-object · …/resources/guild#modify-guild-role
 */

/** Discord nimmt Rollen-Symbole ab 64 × 64 Pixel – die Kachel (27 Pixel) wird ohne Weichzeichnen vervierfacht. */
const SCALE = 4;
/** Ändert sich die Zeichnung, steigt die Zahl – dann bekommt jede Rolle ihr Bild neu. */
const DESIGN = 1;
const RGBA = 4;
const FINGERPRINT_LENGTH = 16;
/** Funktion des Servers, ohne die Discord keine Rollen-Symbole annimmt. */
export const ROLE_ICONS_FEATURE = 'ROLE_ICONS';
/** Gemerkt: hatte der Server beim letzten Abgleich Rollen-Symbole („on“/„off“)? */
export const ROLE_ICONS_KEY = 'roles:icons';

export interface RankIcon {
  readonly png: Buffer;
  readonly dataUri: string;
  /** Kurzer Fingerabdruck des Bilds – so merkt sich der Bot, welche Fassung er zuletzt hochgeladen hat. */
  readonly fingerprint: string;
}

/** Wie Discord einen Rang zeigt: mit Bild (Rollen-Symbol) oder mit dem Symbol im Namen. */
export type RankLook = 'icons' | 'names';
/** Warum gerade ohne Bild: kein Boost (Stufe 2) oder Abzeichen im Panel aus. */
export type RankLookReason = 'boost' | 'badges_off' | null;

const cache = new Map<string, RankIcon | null>();

/** Rollen-Symbol eines Rangs (Kachel mit seinem Symbol in seiner Farbe) – ohne Symbol keins. */
export function rankIconOf(role: Pick<Role, 'symbol' | 'colour'>): RankIcon | null {
  const id = JSON.stringify([role.symbol.trim(), role.colour.toLowerCase()]);
  const known = cache.get(id);
  if (known !== undefined) return known;
  const tile = drawBadgeTile({ symbol: role.symbol, colour: role.colour });
  const icon = tile ? iconFrom(tile.width, tile.height, tile.rgba) : null;
  cache.set(id, icon);
  return icon;
}

function iconFrom(width: number, height: number, rgba: Uint8Array): RankIcon {
  const big = new Picture(width * SCALE, height * SCALE);
  Array.from({ length: big.width * big.height }, (_, n) => n).forEach((n) => {
    const x = n % big.width;
    const y = Math.floor(n / big.width);
    const from = (Math.floor(y / SCALE) * width + Math.floor(x / SCALE)) * RGBA;
    big.data.set(rgba.subarray(from, from + RGBA), n * RGBA);
  });
  const png = big.png();
  const hash = crypto.createHash('sha1').update(`${DESIGN}:`).update(png).digest('hex');
  return {
    png,
    dataUri: `data:image/png;base64,${png.toString('base64')}`,
    fingerprint: hash.slice(0, FINGERPRINT_LENGTH),
  };
}

/** Rang-Abzeichen im Panel an (Einstellungen → Rang-Abzeichen)? */
export const badgesOn = (stores: Pick<Stores, 'settings'>): boolean =>
  stores.settings('badges')['enabled'] !== false;

/** Bild oder Name – und warum. */
export function rankLook(roleIcons: boolean, badges: boolean): { look: RankLook; reason: RankLookReason } {
  if (!badges) return { look: 'names', reason: 'badges_off' };
  return roleIcons ? { look: 'icons', reason: null } : { look: 'names', reason: 'boost' };
}
