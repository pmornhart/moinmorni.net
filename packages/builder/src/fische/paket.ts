/**
 * Das Angelkönig-Paket: ein kleines Ressourcenpaket mit einer eigenen Zeichnung für jeden Fisch, den Steinkrebs und
 * die Fundstücke. Angelkönig schreibt in jeden Fang den Namen der Art als `custom_model_data` (Text, z. B.
 * „moinmorni:fisch/hecht“); das Paket tauscht für genau diese Namen das Aussehen der Grund-Gegenstände (Kabeljau,
 * Lachs …). Alles andere – ein gewöhnlicher Kabeljau, ein Spieler ohne Paket, ältere Clients, Bedrock – bleibt beim
 * Minecraft-Gegenstand. Gleiche Zeichnungen = gleiche Bytes = gleiche SHA-1.
 */
import { Picture, zipOf, type ZipEntry } from '../png.js';
import { allFishArt, type FishArt } from './arten.js';
import { stack } from './leinwand.js';

/** Feste Kennung des Pakets (der Proxy nimmt es beim Verlassen von Angelkönig wieder ab). */
export const ANGEL_PACK_ID = '6d6f696e-6d6f-726e-692d-616e67656c6b';

const NS = 'moinmorni';
/** Ressourcenpaket-Bereich wie beim Möbel-Paket (Minecraft liest `pack_format` bzw. ab 1.21.9 `min/max_format`). */
const PACK_FORMAT = 15;
const PACK_FORMAT_MAX = 999;
const JSON_INDENT = 2;
/** Ticks je Bild, falls die Zeichnung nichts sagt. */
const FRAMETIME = 2;
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, JSON_INDENT)}\n`);

/**
 * In der Hand etwas kleiner als ein gewöhnliches Bild (die Zeichnungen füllen das Bild bis in die Ecken): so sieht man
 * in der Ich-Sicht den ganzen Fisch. Werte wie `item/generated`, nur kleiner und etwas tiefer.
 */
const FIRST_PERSON = { rotation: [0, -90, 25], translation: [1.13, 2.4, 1.13], scale: [0.5, 0.5, 0.5] };
const HELD = { firstperson_righthand: FIRST_PERSON, firstperson_lefthand: FIRST_PERSON };

export interface FishPackEntry {
  /** Kennung der Art (`Species.id()` in Angelkönig). */
  readonly id: string;
  /** Minecraft-Gegenstand des Fangs. */
  readonly base: string;
}

/** Modell-Name im Gegenstand (`custom_model_data`), gleich wie `ANGEL_MODEL_PREFIX` in @moinmorni/shared. */
export const fishModelName = (id: string): string => `${NS}:fisch/${id}`;

/**
 * Was Minecraft ohne unseren Namen zeigt – genau wie die eingebauten Gegenstände (gleiche Modelle, Lederstiefel mit
 * Leder-Farbe). Steht ein anderer Gegenstand in der Liste, gilt das einfache Modell gleichen Namens.
 */
const DYED = new Set(['leather_boots']);
const LEATHER_DEFAULT = -6265536;

function vanilla(base: string): unknown {
  return DYED.has(base)
    ? {
        type: 'minecraft:model',
        model: `minecraft:item/${base}`,
        tints: [{ type: 'minecraft:dye', default: LEATHER_DEFAULT }],
      }
    : { type: 'minecraft:model', model: `minecraft:item/${base}` };
}

/** Aussehen eines Grund-Gegenstands: je Art unser Modell, sonst Minecraft. */
export function itemDefinition(base: string, ids: readonly string[]): unknown {
  return {
    model: {
      type: 'minecraft:select',
      property: 'minecraft:custom_model_data',
      index: 0,
      cases: ids.map((id) => ({
        when: fishModelName(id),
        model: { type: 'minecraft:model', model: `${NS}:item/fisch/${id}` },
      })),
      fallback: vanilla(base),
    },
  };
}

function textureEntries(art: FishArt): ZipEntry[] {
  const path = `assets/${NS}/textures/item/fisch/${art.id}.png`;
  const png = { name: path, data: stack(art.frames).png() };
  if (art.frames.length === 1) return [png];
  return [
    png,
    { name: `${path}.mcmeta`, data: json({ animation: { frametime: art.frametime ?? FRAMETIME } }) },
  ];
}

/** Das Paket als ZIP. */
export function fishPack(entries: readonly FishPackEntry[]): Buffer {
  const arts = allFishArt(entries.map((e) => e.id));
  const bases = [...new Set(entries.map((e) => e.base))].sort();
  const meta = {
    pack: {
      description: 'MoinMorni – Fische im Angelkönig',
      pack_format: PACK_FORMAT,
      supported_formats: { min_inclusive: PACK_FORMAT, max_inclusive: PACK_FORMAT_MAX },
      min_format: PACK_FORMAT,
      max_format: PACK_FORMAT_MAX,
    },
  };
  const icon = arts.find((a) => a.id === 'goldforelle')?.frames[0];
  return zipOf([
    { name: 'pack.mcmeta', data: json(meta) },
    ...(icon ? [{ name: 'pack.png', data: icon.picture().png() }] : []),
    ...bases.map((base) => ({
      name: `assets/minecraft/items/${base}.json`,
      data: json(
        itemDefinition(
          base,
          entries.filter((e) => e.base === base).map((e) => e.id),
        ),
      ),
    })),
    ...arts.map((art) => ({
      name: `assets/${NS}/models/item/fisch/${art.id}.json`,
      data: json({
        parent: 'minecraft:item/generated',
        textures: { layer0: `${NS}:item/fisch/${art.id}` },
        display: HELD,
      }),
    })),
    ...arts.flatMap(textureEntries),
  ]);
}

/** Einzelbild einer Art als PNG (erstes Bild der Bildfolge) – für die Webseite. */
export function fishPicture(id: string, scale = 1): Buffer {
  const art = allFishArt([id])[0];
  const first = art?.frames[0];
  if (!first) throw new Error(`Keine Zeichnung für ${id}`);
  if (scale === 1) return first.picture().png();
  const big = first.picture();
  return scaled(big.data, first.size, scale);
}

function scaled(rgba: Buffer, size: number, scale: number): Buffer {
  const out = new Picture(size * scale, size * scale);
  const BYTES = 4;
  Array.from({ length: size * scale * size * scale }, (_, i) => {
    const x = i % (size * scale);
    const y = Math.floor(i / (size * scale));
    const src = (Math.floor(y / scale) * size + Math.floor(x / scale)) * BYTES;
    rgba.copy(out.data, i * BYTES, src, src + BYTES);
  });
  return out.png();
}
