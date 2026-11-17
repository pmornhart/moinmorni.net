import crypto from 'node:crypto';
import { Picture, zipOf, type ZipEntry } from '@moinmorni/builder';
import {
  BADGE_HEIGHT,
  JAIL_BADGE,
  badgeKeys,
  drawBadge,
  type BadgeLook,
  type BadgePicture,
  type Role,
} from '@moinmorni/shared';
import type { Api } from '../app.js';

/**
 * Das Abzeichen-Paket: ein kleines Ressourcenpaket mit einem Pixel-Schild pro Rang (packages/shared/src/badges.ts).
 * Jedes Schild liegt als Bild auf einem eigenen Zeichen der Standard-Schrift (Bereich für eigene Zeichen ab U+E900),
 * und die Sprachdateien übersetzen den Schlüssel des Rangs („♛ “) in dieses Zeichen. Der Proxy schickt das Paket
 * jedem Java-Spieler beim Betreten (eigene Kennung neben dem Möbel-Paket der Lobby, bleibt auf allen Servern).
 *
 * Gleiche Ränge = gleiche Bytes = gleiche SHA-1: Minecraft lädt nur neu, wenn sich im Panel Name, Symbol oder Farbe
 * eines Rangs ändern.
 */

export const BADGE_PACK_PATH = '/api/public/packs/abzeichen.zip';
/** Erstes eigenes Zeichen der Abzeichen (MorniCraft nimmt U+E700, so kommen sich beide nie in die Quere). */
const FIRST_CHAR = 0xe900;
/** Ressourcenpaket-Bereich wie beim Möbel-Paket (Minecraft liest `pack_format` bzw. ab 1.21.9 `min/max_format`). */
const PACK_FORMAT = 15;
const PACK_FORMAT_MAX = 999;
/** Das Bild ist 9 Pixel hoch; mit Oberkante 8 über der Grundlinie deckt das Schild genau die Großbuchstaben ab. */
const ASCENT = 8;
const NAMESPACE = 'moinmorni';
/** Minecraft-Sprachen mit deutschen Namen auf den Abzeichen (wie der Hub: alles mit „de“ vorne ist Deutsch). */
const GERMAN_LANGS = ['de_de', 'de_at', 'de_ch'] as const;
/** Weiß vor dem Zeichen: Sonst färbte Minecraft das Bild in der Farbe des Rangs ein. */
const WHITE = '§f';

export interface BadgePack {
  readonly bytes: Buffer;
  /** SHA-1 des ZIPs (hex), so wie Minecraft sie haben will. */
  readonly sha1: string;
  /** Rang → Schlüssel, unter dem er im Spiel steht. */
  readonly keys: Readonly<Record<string, string>>;
}

const JSON_INDENT = 2;
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, JSON_INDENT)}\n`);

function png(picture: BadgePicture): Buffer {
  const p = new Picture(picture.width, picture.height);
  p.data.set(picture.rgba);
  return p.png();
}

interface Entry {
  readonly key: string;
  readonly de: BadgeLook;
  readonly en: BadgeLook;
}

/** Das Paket für diese Ränge (dazu das Gefängnis). */
export function buildBadgePack(roles: readonly Role[]): BadgePack {
  const keys = badgeKeys(roles);
  const entries: Entry[] = [
    ...[...roles]
      .sort((a, b) => a.position - b.position)
      .map((role) => ({
        key: keys[role.id] ?? '',
        de: { text: role.name.de, symbol: role.symbol, colour: role.colour },
        en: { text: role.name.en, symbol: role.symbol, colour: role.colour },
      })),
    {
      key: JAIL_BADGE.key,
      de: { text: JAIL_BADGE.name.de, symbol: JAIL_BADGE.symbol, colour: JAIL_BADGE.colour },
      en: { text: JAIL_BADGE.name.en, symbol: JAIL_BADGE.symbol, colour: JAIL_BADGE.colour },
    },
  ];
  // Gleiche Bilder nur einmal (Owner heißt auf Deutsch und Englisch gleich).
  const pictures = new Map<string, { readonly char: string; readonly file: string; readonly png: Buffer }>();
  const charOf = (look: BadgeLook): string | null => {
    const id = JSON.stringify([look.text, look.symbol, look.colour]);
    const known = pictures.get(id);
    if (known) return known.char;
    const picture = drawBadge(look);
    if (!picture) return null;
    const index = pictures.size;
    const entry = { char: String.fromCodePoint(FIRST_CHAR + index), file: `${index}.png`, png: png(picture) };
    pictures.set(id, entry);
    return entry.char;
  };
  const langFile = (lang: 'de' | 'en'): Record<string, string> =>
    Object.fromEntries(
      entries.flatMap((e) => {
        const char = charOf(e[lang]);
        return char ? [[e.key, `${WHITE}${char} `] as const] : [];
      }),
    );
  const english = langFile('en');
  const german = langFile('de');
  const font = {
    providers: [...pictures.values()].map((p) => ({
      type: 'bitmap',
      file: `${NAMESPACE}:font/abzeichen/${p.file}`,
      ascent: ASCENT,
      height: BADGE_HEIGHT,
      chars: [p.char],
    })),
  };
  const meta = {
    pack: {
      description: 'MoinMorni – Rang-Abzeichen',
      pack_format: PACK_FORMAT,
      supported_formats: { min_inclusive: PACK_FORMAT, max_inclusive: PACK_FORMAT_MAX },
      min_format: PACK_FORMAT,
      max_format: PACK_FORMAT_MAX,
    },
  };
  const files: ZipEntry[] = [
    { name: 'pack.mcmeta', data: json(meta) },
    { name: 'assets/minecraft/font/default.json', data: json(font) },
    // Englisch ist die Grundlage jeder Sprache, Deutsch legt sich für deutsche Clients darüber.
    { name: `assets/${NAMESPACE}/lang/en_us.json`, data: json(english) },
    ...GERMAN_LANGS.map((lang) => ({ name: `assets/${NAMESPACE}/lang/${lang}.json`, data: json(german) })),
    ...[...pictures.values()].map((p) => ({
      name: `assets/${NAMESPACE}/textures/font/abzeichen/${p.file}`,
      data: p.png,
    })),
  ];
  const bytes = zipOf(files);
  return { bytes, sha1: crypto.createHash('sha1').update(bytes).digest('hex'), keys };
}

const cache: { id: string; pack: BadgePack | null } = { id: '', pack: null };

/** Das Paket zu den Rängen von gerade – nur neu gebaut, wenn sich im Panel etwas daran geändert hat. */
export function badgePackOf(roles: readonly Role[]): BadgePack {
  const id = JSON.stringify(roles.map((r) => [r.id, r.name, r.symbol, r.colour, r.position]));
  if (cache.pack && cache.id === id) return cache.pack;
  const pack = buildBadgePack(roles);
  cache.id = id;
  cache.pack = pack;
  return pack;
}

/**
 * Öffentliche Adresse des Pakets, nur mit eigener Domain (Minecraft lädt nur von außen erreichbare Adressen). Die
 * SHA-1 hängt hinten dran, damit kein Zwischenspeicher unterwegs ein altes Paket liefert.
 */
export function badgePackUrl(domain: string, sha1: string): string | null {
  const host = domain.trim();
  return host ? `https://${host}${BADGE_PACK_PATH}?v=${sha1}` : null;
}

/** Die Webseite liefert das Paket aus (öffentlich, wie das Möbel-Paket der Lobby). */
export function registerBadgeRoutes(app: Api, roles: () => readonly Role[]): void {
  app.get(BADGE_PACK_PATH, async (_request, reply) => {
    const pack = badgePackOf(roles());
    return reply
      .header('content-type', 'application/zip')
      .header('cache-control', 'public, max-age=300')
      .header('etag', `"${pack.sha1}"`)
      .send(pack.bytes);
  });
}
