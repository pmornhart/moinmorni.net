/**
 * Hüte und Kleidung aus dem Kleiderschrank von Angelkönig mit ihrem eigenen Aussehen. Jedes Stück hat einen festen
 * Modell-Namen (`moinmorni:kleidung/<stück>`): Angelkönig schreibt ihn in die Komponente `custom_model_data`, das
 * Angelkönig-Paket (`packages/builder/src/kleidung/`) zeigt dafür das eigene 3D-Modell bzw. die eigene Zeichnung. Hüte
 * sitzen als 3D-Modell auf dem Kopf, Weste, Jacke, Hosen und Stiefel tragen ein eigenes Muster am Körper
 * (Ausrüstungs-Aussehen `moinmorni:kleidung/<stück>`). Ohne Paket, auf älteren Clients und auf Bedrock bleibt das
 * gewöhnliche Minecraft-Stück (Lederhelm in der Farbe, Goldhelm …).
 *
 * Gleich wie `ClothingModels.java` im Repo pmornhart/morni-angelkoenig (Kopie der Liste: `docs/kleidung-modelle.txt`
 * dort und `packages/shared/test/angel-kleidung.txt` hier – ein Test prüft beides).
 */

/** Wo man es trägt (wie `Cosmetic.Slot` in Angelkönig). */
export type AngelClothingSlot = 'head' | 'chest' | 'legs' | 'feet';

export interface AngelClothing {
  /** Kennung wie `Cosmetic.id()` in Angelkönig. */
  readonly id: string;
  readonly slot: AngelClothingSlot;
  /** Minecraft-Gegenstand (ohne Paket sieht man ihn). */
  readonly base: string;
  readonly de: string;
  readonly en: string;
  /** Kurzer Satz für die Webseite. */
  readonly noteDe: string;
  readonly noteEn: string;
  /** Preis beim Fischhändler in Talern (0 = nicht zu kaufen). */
  readonly price: number;
}

/** Namensraum und Ordner der Modelle im Paket. */
export const ANGEL_CLOTHING_PREFIX = 'moinmorni:kleidung/';

export const ANGEL_CLOTHES: readonly AngelClothing[] = [
  {
    id: 'fischerhut',
    slot: 'head',
    base: 'leather_helmet',
    de: 'Fischerhut',
    en: "Fisher's hat",
    noteDe: 'Olivgrüner Anglerhut mit Krempe, Luftlöchern und bunten Fliegen am Band.',
    noteEn: 'Olive bucket hat with a brim, air holes and colourful flies on the band.',
    price: 150,
  },
  {
    id: 'strohhut',
    slot: 'head',
    base: 'leather_helmet',
    de: 'Strohhut',
    en: 'Straw hat',
    noteDe: 'Geflochtenes Stroh, breite Krempe, rot-weißes Band mit Schleife und Blümchen.',
    noteEn: 'Woven straw, wide brim, a red-and-white ribbon with a bow and little flowers.',
    price: 200,
  },
  {
    id: 'trachtenhut',
    slot: 'head',
    base: 'leather_helmet',
    de: 'Trachtenhut',
    en: 'Alpine hat',
    noteDe: 'Grüner Filzhut mit gedrehter Kordel, Edelweiß und buschigem Gamsbart.',
    noteEn: 'Green felt hat with a twisted cord, an edelweiss and a bushy chamois tuft.',
    price: 400,
  },
  {
    id: 'koenigskrone',
    slot: 'head',
    base: 'golden_helmet',
    de: 'Königskrone',
    en: "King's crown",
    noteDe: 'Goldene Krone mit Edelsteinen, Samt und einem goldenen Fisch – das Licht wandert übers Gold.',
    noteEn: 'A golden crown with gems, velvet and a golden fish – light sweeps across the gold.',
    price: 0,
  },
  {
    id: 'anglerweste',
    slot: 'chest',
    base: 'leather_chestplate',
    de: 'Anglerweste',
    en: 'Fishing vest',
    noteDe: 'Ärmellose Weste mit vielen Taschen, Reißverschluss und einem Flicken voller Fliegen.',
    noteEn: 'Sleeveless vest with lots of pockets, a zip and a patch full of flies.',
    price: 250,
  },
  {
    id: 'regenjacke',
    slot: 'chest',
    base: 'leather_chestplate',
    de: 'Gelbe Regenjacke',
    en: 'Yellow raincoat',
    noteDe: 'Knallgelb mit Knebelknöpfen, Kapuze im Rücken und Leuchtstreifen.',
    noteEn: 'Bright yellow with toggle buttons, a hood at the back and reflective stripes.',
    price: 300,
  },
  {
    id: 'lederhose',
    slot: 'legs',
    base: 'leather_leggings',
    de: 'Lederhose',
    en: 'Lederhosen',
    noteDe: 'Kurze Lederhose mit Hosenträgern, besticktem Latz und grünen Nähten.',
    noteEn: 'Short leather trousers with braces, an embroidered bib and green stitching.',
    price: 350,
  },
  {
    id: 'wathose',
    slot: 'legs',
    base: 'leather_leggings',
    de: 'Wathose',
    en: 'Waders',
    noteDe: 'Bis zur Brust, mit Trägern, Schnallen und angesetzten Stiefeln – dicht bis zum Bauch.',
    noteEn: 'Chest-high with straps, buckles and built-in boots – dry up to your belly.',
    price: 250,
  },
  {
    id: 'gummistiefel',
    slot: 'feet',
    base: 'leather_boots',
    de: 'Gummistiefel',
    en: 'Rubber boots',
    noteDe: 'Dunkelgrüne Gummistiefel mit gelbem Rand, dicker Sohle und ein paar Schlammspritzern.',
    noteEn: 'Dark green rubber boots with a yellow rim, a chunky sole and a few mud splashes.',
    price: 150,
  },
];

/** Modell-Name eines Stücks, z. B. `moinmorni:kleidung/fischerhut` (auch das Ausrüstungs-Aussehen am Körper). */
export const clothingModelName = (id: string): string => `${ANGEL_CLOTHING_PREFIX}${id}`;

/** Alle Modell-Namen in der Reihenfolge des Kleiderschranks. */
export const ANGEL_CLOTHING_NAMES: readonly string[] = ANGEL_CLOTHES.map((c) => clothingModelName(c.id));
