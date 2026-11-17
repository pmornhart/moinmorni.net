/* eslint-disable ts-patterns/no-magic-numbers -- colours of the outfits */
/**
 * Die Leute der Lobby: Modus-Figuren (zum Anklicken) und Dorfbewohner. Jede Figur hat ein eigenes Outfit
 * (`skins.ts`); das Texturpaket legt sie unter `assets/moinmorni/textures/npc/<id>.png` ab, Figuren nutzen sie mit
 * `profile:{texture:'moinmorni:npc/<id>'}`.
 */
import crypto from 'node:crypto';
import { CAST_TEXTURES } from './cast-textures.js';
import { MODE_FIGURES } from './figuren.js';
import { zipOf } from './png.js';
import { skinPicture, type Outfit } from './skins.js';

const SKIN = { light: 0xf1c7a1, fair: 0xf6d2b8, warm: 0xe0ac7e, tan: 0xc68b5e, dark: 0x8d5a3b } as const;
const HAIR = {
  brown: 0x5a3a22,
  blond: 0xd9b45a,
  black: 0x2a2420,
  red: 0xa4482a,
  grey: 0xb8b4ae,
  auburn: 0x7a3b1e,
} as const;
const EYES = { brown: 0x4a2f1c, blue: 0x3a6fb0, green: 0x3f7a4a } as const;
const LEDER = 0x6b4426;
const WHITE = 0xf0ede4;
const WOOL = 0xe8e2d0;
const BLACK_SHOES = 0x2b2622;
const BROWN_SHOES = 0x4a3020;

/** Lederhose, Hemd, Kniestrümpfe – Grundlage für die Männer im Dorf. */
function bua(extra: Partial<Outfit> & Pick<Outfit, 'hair' | 'top'>): Outfit {
  return {
    skin: SKIN.light,
    hairStyle: 'short',
    eyes: EYES.brown,
    bottom: { kind: 'lederhose', colour: LEDER },
    braces: 0x4e311b,
    socks: WOOL,
    shoes: BLACK_SHOES,
    ...extra,
  };
}

/** Dirndl: Bluse, Mieder mit Schnürung, Rock, Schürze. */
function dirndl(extra: Partial<Outfit> & Pick<Outfit, 'hair' | 'bodice' | 'bottom' | 'apron'>): Outfit {
  return {
    skin: SKIN.light,
    hairStyle: 'braids',
    eyes: EYES.blue,
    top: { colour: WHITE, sleeves: 'short' },
    socks: WOOL,
    shoes: BLACK_SHOES,
    ...extra,
  };
}

/** Modus-Figuren (Kostüme in `figuren.ts`): die sieben am Maibaum. */
export const MODE_CAST: Readonly<Record<string, Outfit>> = {
  mornicraft: MODE_FIGURES.mornicraft,
  duels: MODE_FIGURES.duels,
  party: MODE_FIGURES.party,
  gipfelsturm: MODE_FIGURES.gipfelsturm,
  burgverlies: MODE_FIGURES.burgverlies,
  bollwerk: MODE_FIGURES.bollwerk,
  mirni: MODE_FIGURES.mirni,
};

/** Die Leute im Dorf. */
export const VILLAGE_CAST: Readonly<Record<string, Outfit>> = {
  wirt: bua({
    hair: HAIR.brown,
    beard: 0x5a3a22,
    hat: { kind: 'tyrol', colour: 0x2f4f2f, accent: 0x7a1f1f },
    top: { colour: WHITE, sleeves: 'long' },
    vest: 0x2f5d3a,
  }),
  kellnerin: dirndl({
    hair: HAIR.blond,
    bodice: { colour: 0x2f6b46, lacing: WHITE },
    bottom: { kind: 'skirt', colour: 0x34558f },
    apron: 0xe9b7c9,
  }),
  kellnerin2: dirndl({
    hair: HAIR.brown,
    hairStyle: 'bun',
    eyes: EYES.brown,
    bodice: { colour: 0xa3242c, lacing: 0xe0b83a },
    bottom: { kind: 'skirt', colour: 0x23345c },
    apron: 0xa9cdea,
  }),
  baecker: {
    skin: SKIN.fair,
    hair: HAIR.brown,
    hairStyle: 'short',
    eyes: EYES.blue,
    hat: { kind: 'chef', colour: 0xf7f5ef },
    top: { colour: 0xf4f1ea, sleeves: 'long' },
    apron: 0xe6dfcf,
    bottom: { kind: 'trousers', colour: 0x8a8f99 },
    shoes: BLACK_SHOES,
  },
  schmied: {
    skin: SKIN.tan,
    hair: HAIR.black,
    hairStyle: 'bald',
    eyes: EYES.brown,
    beard: 0x2a2420,
    top: { colour: 0x7d5a43, sleeves: 'short' },
    apron: 0x4e3320,
    bottom: { kind: 'trousers', colour: 0x3b3530 },
    shoes: BLACK_SHOES,
  },
  buergermeister: {
    skin: SKIN.light,
    hair: HAIR.grey,
    hairStyle: 'short',
    eyes: EYES.blue,
    beard: 0xb8b4ae,
    top: { colour: WHITE, sleeves: 'long' },
    vest: 0x26232b,
    belt: 0xc9a227,
    bottom: { kind: 'trousers', colour: 0x27252a },
    shoes: BLACK_SHOES,
  },
  fuehrerin: {
    skin: SKIN.fair,
    hair: HAIR.red,
    hairStyle: 'long',
    eyes: EYES.green,
    hat: { kind: 'cap', colour: 0x2f8a57, accent: 0x1f5e3a },
    top: { colour: 0x3c9a63, sleeves: 'long', accent: 0xf0ede4 },
    bottom: { kind: 'trousers', colour: 0xcab89a },
    shoes: BROWN_SHOES,
  },
  kraemer: {
    skin: SKIN.warm,
    hair: HAIR.black,
    hairStyle: 'short',
    eyes: EYES.brown,
    hat: { kind: 'cap', colour: 0x6b4426, accent: 0x4e311b },
    top: { colour: 0x5a78a8, sleeves: 'long' },
    apron: 0x8a6a4a,
    bottom: { kind: 'trousers', colour: 0x3a3a40 },
    shoes: BROWN_SHOES,
  },
  apothekerin: {
    skin: SKIN.dark,
    hair: HAIR.black,
    hairStyle: 'bun',
    eyes: EYES.brown,
    top: { colour: 0xf4f4f0, sleeves: 'long', accent: 0x6fa8a0 },
    bottom: { kind: 'trousers', colour: 0x34384a },
    shoes: BLACK_SHOES,
  },
  schreiner: bua({
    hair: HAIR.blond,
    hat: { kind: 'straw', colour: 0xe2c76a, accent: 0x7a1f1f },
    top: { colour: 0xc0473c, sleeves: 'short', accent: 0xe8d8c8 },
    bottom: { kind: 'trousers', colour: 0x3a4f78 },
    socks: undefined,
  }),
  gast1: bua({
    hair: HAIR.brown,
    hat: { kind: 'tyrol', colour: 0x3d3a33, accent: 0x2f5d3a },
    top: { colour: 0xc0473c, sleeves: 'long', accent: 0xe8d8c8 },
  }),
  gast2: dirndl({
    hair: HAIR.auburn,
    hairStyle: 'long',
    bodice: { colour: 0x2a4f8c, lacing: WHITE },
    bottom: { kind: 'skirt', colour: 0xb33c4a },
    apron: 0xf2e6c8,
  }),
  gast3: bua({
    hair: HAIR.blond,
    eyes: EYES.blue,
    top: { colour: 0x9cc3e6, sleeves: 'short', accent: 0x6f9ec9 },
  }),
  gast4: dirndl({
    skin: SKIN.tan,
    hair: HAIR.black,
    eyes: EYES.brown,
    bodice: { colour: 0x7a2a5a, lacing: 0xf2c230 },
    bottom: { kind: 'skirt', colour: 0x2f6b46 },
    apron: 0xf0ede4,
  }),
  gast5: bua({
    hair: HAIR.grey,
    hairStyle: 'bald',
    beard: 0xd8d4ce,
    hat: { kind: 'tyrol', colour: 0x2f4f2f, accent: 0xb8b4ae },
    top: { colour: WHITE, sleeves: 'long' },
    vest: 0x7a1f1f,
  }),
  gast6: {
    skin: SKIN.warm,
    hair: HAIR.brown,
    hairStyle: 'long',
    eyes: EYES.green,
    top: { colour: 0xe8a0b4, sleeves: 'long', accent: 0xf0ede4 },
    bottom: { kind: 'skirt', colour: 0x3c6e8f },
    shoes: BROWN_SHOES,
  },
  gast7: bua({
    skin: SKIN.dark,
    hair: HAIR.black,
    top: { colour: 0x6fa86a, sleeves: 'short', accent: 0x4f8a4a },
  }),
  gast8: dirndl({
    skin: SKIN.fair,
    hair: HAIR.red,
    hairStyle: 'bun',
    eyes: EYES.green,
    bodice: { colour: 0x3a3a46, lacing: 0xe9b7c9 },
    bottom: { kind: 'skirt', colour: 0x8a5a9a },
    apron: 0xe9b7c9,
  }),
  bua: bua({
    skin: SKIN.fair,
    hair: HAIR.blond,
    eyes: EYES.blue,
    top: { colour: 0xf2c230, sleeves: 'short' },
  }),
  madl: dirndl({
    skin: SKIN.warm,
    hair: HAIR.brown,
    bodice: { colour: 0xe0457b, lacing: WHITE },
    bottom: { kind: 'skirt', colour: 0x5aa9e6 },
    apron: 0xf7f5ef,
  }),
};

export const CAST: Readonly<Record<string, Outfit>> = { ...MODE_CAST, ...VILLAGE_CAST };

/**
 * Neue Figuren (16.11.: die Modi vom Schlossmarkt und die Blumenfrau, 17.11.: Maibaumklau, Dorfkrimi, Baumeister). Solange eine
 * neue Figur noch nicht von Mojang signiert ist, trägt sie die Tracht einer bestehenden Figur (`STAND_IN`); sobald
 * `tsx tools/lobby-entwuerfe/src/sign-skins.ts` sie signiert hat, trägt sie von selbst ihre eigene.
 */
export const PENDING_CAST: Readonly<Record<string, Outfit>> = {
  wolkenkampf: MODE_FIGURES.wolkenkampf,
  versteckerl: MODE_FIGURES.versteckerl,
  wintersport: MODE_FIGURES.wintersport,
  adlerflug: MODE_FIGURES.adlerflug,
  angelkoenig: MODE_FIGURES.angelkoenig,
  maibaumklau: MODE_FIGURES.maibaumklau,
  dorfkrimi: MODE_FIGURES.dorfkrimi,
  baumeister: MODE_FIGURES.baumeister,
  blumenfrau: dirndl({
    skin: SKIN.fair,
    hair: HAIR.auburn,
    hairStyle: 'bun',
    eyes: EYES.green,
    hat: { kind: 'straw', colour: 0xe2c76a, accent: 0xe0457b },
    bodice: { colour: 0x7aa84a, lacing: 0xf2c230 },
    bottom: { kind: 'skirt', colour: 0xc2387f },
    apron: 0xf7f5ef,
  }),
};

/** Wer bis zur Signatur für eine neue Figur einspringt (passende, schon signierte Tracht). */
export const STAND_IN: Readonly<Record<string, string>> = {
  wolkenkampf: 'fuehrerin',
  versteckerl: 'gast1',
  wintersport: 'gast3',
  adlerflug: 'gast7',
  angelkoenig: 'gast5',
  maibaumklau: 'gast3',
  dorfkrimi: 'gast1',
  baumeister: 'schreiner',
  blumenfrau: 'gast8',
};

/** Von Mojang signierte Skin-Daten einer Figur (über MineSkin, siehe `cast-textures.ts`). */
export interface SignedSkin {
  /** SHA-256 des Skin-Bilds, aus dem signiert wurde. */
  readonly hash: string;
  readonly value: string;
  readonly signature: string;
  /** Kennung bei MineSkin (zum Nachschlagen). */
  readonly mineskin: string;
}

export { CAST_TEXTURES };

/**
 * Die ersten 27 Figuren in der Reihenfolge, in der sie signiert wurden: Ihr Stoffmuster hängt an dieser Stelle. Neue
 * Figuren kommen hinten dazu (nie einsortieren) – sonst ändert sich jedes Bild und alle müssten neu signiert werden.
 */
const SEED_ORDER: readonly string[] = [
  'apothekerin',
  'baecker',
  'bollwerk',
  'bua',
  'buergermeister',
  'burgverlies',
  'duels',
  'fuehrerin',
  'gast1',
  'gast2',
  'gast3',
  'gast4',
  'gast5',
  'gast6',
  'gast7',
  'gast8',
  'gipfelsturm',
  'kellnerin',
  'kellnerin2',
  'kraemer',
  'madl',
  'mirni',
  'mornicraft',
  'party',
  'schmied',
  'schreiner',
  'wirt',
  // 16.11.: die neuen Modus-Figuren und die Blumenfrau am Schlossmarkt
  'wolkenkampf',
  'versteckerl',
  'wintersport',
  'adlerflug',
  'angelkoenig',
  'blumenfrau',
  // 17.11. abends: Maibaumklau, Dorfkrimi, Baumeister
  'maibaumklau',
  'dorfkrimi',
  'baumeister',
];

/** Skin-Bild einer Figur (immer dasselbe Bild für dieselbe Tracht). */
export function castSkinPng(id: string): Buffer {
  const outfit = CAST[id] ?? PENDING_CAST[id];
  if (!outfit) throw new Error(`Unbekannte Figur: ${id}`);
  const seed = SEED_ORDER.indexOf(id);
  if (seed < 0) throw new Error(`Figur ${id} fehlt in SEED_ORDER (hinten anhängen)`);
  return skinPicture(outfit, seed + 1).png();
}

export function skinHash(png: Buffer): string {
  return crypto.createHash('sha256').update(png).digest('hex');
}

/** Signierte Skin-Daten, wenn sie zur aktuellen Tracht passen – sonst null (dann neu signieren). */
export function signedSkin(id: string): SignedSkin | null {
  const signed = CAST_TEXTURES[id];
  if (!signed || !(CAST[id] ?? PENDING_CAST[id])) return null;
  return signed.hash === skinHash(castSkinPng(id)) ? signed : null;
}

/**
 * Welche Figur wirklich dasteht: eine bestehende, eine neue mit eigener Signatur – oder, solange die fehlt, ihre
 * Vertretung (Skin und 3D-Tracht passen dann zusammen).
 */
export function castFor(id: string): { readonly id: string; readonly outfit: Outfit | undefined } {
  if (CAST[id]) return { id, outfit: CAST[id] };
  const pending = PENDING_CAST[id];
  if (pending && signedSkin(id)) return { id, outfit: pending };
  const standIn = STAND_IN[id];
  return standIn ? { id: standIn, outfit: CAST[standIn] } : { id, outfit: undefined };
}

/** Texturpaket-Bereich (Minecraft liest `pack_format` bzw. ab 1.21.9 `min_format`/`max_format`). */
const PACK_FORMAT = 15;
const PACK_FORMAT_MAX = 999;

/** Texturpaket mit allen Figuren-Skins als ZIP (nur noch für Vorschauen; im Spiel kommen die Skins signiert). */
export function castPack(): Buffer {
  const meta = {
    pack: {
      description: 'MoinMorni – Leute der Lobby',
      pack_format: PACK_FORMAT,
      supported_formats: { min_inclusive: PACK_FORMAT, max_inclusive: PACK_FORMAT_MAX },
      min_format: PACK_FORMAT,
      max_format: PACK_FORMAT_MAX,
    },
  };
  const ids = Object.keys(CAST).sort();
  return zipOf([
    { name: 'pack.mcmeta', data: Buffer.from(JSON.stringify(meta, null, 2)) },
    ...ids.map((id) => ({ name: `assets/moinmorni/textures/npc/${id}.png`, data: castSkinPng(id) })),
  ]);
}
