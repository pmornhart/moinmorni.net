/**
 * Die Fische (und Fundstücke) des Spielmodus Angelkönig mit ihrem eigenen Aussehen. Jede Art hat einen festen
 * Modell-Namen (`moinmorni:fisch/<art>`): Angelkönig schreibt ihn in die Komponente `custom_model_data` des Fangs, das
 * Angelkönig-Paket (`packages/builder/src/fische/`) zeigt dafür die eigene Zeichnung – ohne Paket, auf älteren Clients
 * und auf Bedrock bleibt das gewöhnliche Minecraft-Item.
 *
 * Gleich wie `FishModels.java` im Repo pmornhart/morni-angelkoenig (Kopie der Liste: `docs/fisch-modelle.txt` dort und
 * `packages/shared/test/angel-fische.txt` hier – ein Test prüft beides).
 */

export type AngelRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'junk';

export interface AngelFish {
  /** Kennung wie `Species.id()` in Angelkönig. */
  readonly id: string;
  readonly rarity: AngelRarity;
  /** Minecraft-Gegenstand, den Angelkönig für den Fang nimmt (ohne Paket sieht man ihn). */
  readonly base: string;
  readonly de: string;
  readonly en: string;
  /** Kurzer Satz für die Webseite. */
  readonly noteDe: string;
  readonly noteEn: string;
}

/** Namensraum und Ordner der Modelle im Paket. */
export const ANGEL_MODEL_PREFIX = 'moinmorni:fisch/';

export const ANGEL_FISH: readonly AngelFish[] = [
  {
    id: 'rotauge',
    rarity: 'common',
    base: 'cod',
    de: 'Rotauge',
    en: 'Roach',
    noteDe: 'Silbrig mit roten Augen und roten Flossen.',
    noteEn: 'Silvery with red eyes and red fins.',
  },
  {
    id: 'barsch',
    rarity: 'common',
    base: 'cod',
    de: 'Flussbarsch',
    en: 'Perch',
    noteDe: 'Grün-gold mit dunklen Streifen und stacheliger Rückenflosse.',
    noteEn: 'Green and gold with dark bars and a spiny dorsal fin.',
  },
  {
    id: 'bachforelle',
    rarity: 'common',
    base: 'salmon',
    de: 'Bachforelle',
    en: 'Brown trout',
    noteDe: 'Rote Tupfen mit hellem Rand auf goldbraunem Leib.',
    noteEn: 'Red spots with pale rings on a golden-brown body.',
  },
  {
    id: 'karausche',
    rarity: 'common',
    base: 'pufferfish',
    de: 'Karausche',
    en: 'Crucian carp',
    noteDe: 'Hochrückig, rund und goldbraun.',
    noteEn: 'Deep-bodied, round and golden brown.',
  },
  {
    id: 'renke',
    rarity: 'uncommon',
    base: 'cod',
    de: 'Renke',
    en: 'Whitefish',
    noteDe: 'Schlank, silbern, mit blassblauem Rücken.',
    noteEn: 'Slender and silver with a pale blue back.',
  },
  {
    id: 'aesche',
    rarity: 'uncommon',
    base: 'cod',
    de: 'Äsche',
    en: 'Grayling',
    noteDe: 'Trägt eine bunte Fahne als Rückenflosse.',
    noteEn: 'Wears a colourful flag as its dorsal fin.',
  },
  {
    id: 'schleie',
    rarity: 'uncommon',
    base: 'cod',
    de: 'Schleie',
    en: 'Tench',
    noteDe: 'Olivgrün mit roten Augen und runden Flossen.',
    noteEn: 'Olive green with red eyes and round fins.',
  },
  {
    id: 'steinkrebs',
    rarity: 'uncommon',
    base: 'armadillo_scute',
    de: 'Steinkrebs',
    en: 'Stone crayfish',
    noteDe: 'Kleiner brauner Krebs mit großen Scheren.',
    noteEn: 'Small brown crayfish with big claws.',
  },
  {
    id: 'seesaibling',
    rarity: 'rare',
    base: 'salmon',
    de: 'Seesaibling',
    en: 'Arctic char',
    noteDe: 'Leuchtend roter Bauch, weiß gesäumte Flossen.',
    noteEn: 'Bright red belly and white-edged fins.',
  },
  {
    id: 'hecht',
    rarity: 'rare',
    base: 'cod',
    de: 'Hecht',
    en: 'Pike',
    noteDe: 'Lang, grün gefleckt, mit Entenschnabel-Maul.',
    noteEn: 'Long, green-mottled, with a duck-bill snout.',
  },
  {
    id: 'zander',
    rarity: 'rare',
    base: 'cod',
    de: 'Zander',
    en: 'Zander',
    noteDe: 'Graue Streifen und große, glasige Augen.',
    noteEn: 'Grey bars and big, glassy eyes.',
  },
  {
    id: 'aal',
    rarity: 'rare',
    base: 'cod',
    de: 'Aal',
    en: 'Eel',
    noteDe: 'Schlangenförmig, dunkel, mit gelblichem Bauch.',
    noteEn: 'Snake-like and dark with a yellowish belly.',
  },
  {
    id: 'rutte',
    rarity: 'rare',
    base: 'cod',
    de: 'Rutte',
    en: 'Burbot',
    noteDe: 'Marmoriert, mit einem Bartfaden am Kinn.',
    noteEn: 'Marbled, with a single barbel on its chin.',
  },
  {
    id: 'waller',
    rarity: 'epic',
    base: 'cod',
    de: 'Waller',
    en: 'Wels catfish',
    noteDe: 'Riesig, dunkel marmoriert, mit langen Barteln.',
    noteEn: 'Huge, dark and marbled, with long barbels.',
  },
  {
    id: 'huchen',
    rarity: 'epic',
    base: 'salmon',
    de: 'Huchen',
    en: 'Huchen',
    noteDe: 'Kupferrot mit schwarzen Kreuzchen – König der Bergbäche.',
    noteEn: 'Copper-red with tiny black crosses – king of mountain streams.',
  },
  {
    id: 'seeforelle',
    rarity: 'epic',
    base: 'salmon',
    de: 'Seeforelle',
    en: 'Lake trout',
    noteDe: 'Groß und silbern mit schwarzen x-Tupfen.',
    noteEn: 'Big and silver with black x-shaped spots.',
  },
  {
    id: 'goldforelle',
    rarity: 'legendary',
    base: 'tropical_fish',
    de: 'Goldforelle',
    en: 'Golden trout',
    noteDe: 'Glänzt wie ein Goldstück – das Licht wandert über die Schuppen.',
    noteEn: 'Shines like a gold coin – light sweeps across its scales.',
  },
  {
    id: 'seekoenig',
    rarity: 'legendary',
    base: 'cod',
    de: 'Seekönig',
    en: 'Lake King',
    noteDe: 'Uralter Riesenwaller mit Narben, Moos und goldenen Augen.',
    noteEn: 'Ancient giant catfish with scars, moss and golden eyes.',
  },
  {
    id: 'moorkoenig',
    rarity: 'legendary',
    base: 'cod',
    de: 'Moorkönig',
    en: 'Bog King',
    noteDe: 'Moosbewachsener Riesenhecht mit glühenden Augen.',
    noteEn: 'Moss-grown giant pike with glowing eyes.',
  },
  {
    id: 'kristallsaibling',
    rarity: 'legendary',
    base: 'salmon',
    de: 'Kristallsaibling',
    en: 'Crystal char',
    noteDe: 'Durchscheinend wie Eis, man sieht die Gräten – und es funkelt.',
    noteEn: 'Translucent like ice, you can see its bones – and it sparkles.',
  },
  {
    id: 'stiefel',
    rarity: 'junk',
    base: 'leather_boots',
    de: 'Alter Stiefel',
    en: 'Old boot',
    noteDe: 'Ausgetreten, mit Algen und einem Loch in der Sohle.',
    noteEn: 'Worn out, with weed and a hole in the sole.',
  },
  {
    id: 'treibholz',
    rarity: 'junk',
    base: 'stick',
    de: 'Treibholz',
    en: 'Driftwood',
    noteDe: 'Silbrig gebleicht und glattgeschliffen.',
    noteEn: 'Bleached silver and polished smooth.',
  },
  {
    id: 'flaschenpost',
    rarity: 'junk',
    base: 'glass_bottle',
    de: 'Flaschenpost',
    en: 'Message in a bottle',
    noteDe: 'Grüne Flasche mit Korken und eingerolltem Zettel.',
    noteEn: 'Green bottle with a cork and a rolled-up note.',
  },
];

/** Modell-Name einer Art, z. B. `moinmorni:fisch/hecht`. */
export const angelModelName = (id: string): string => `${ANGEL_MODEL_PREFIX}${id}`;

/** Alle Modell-Namen in der Reihenfolge der Arten. */
export const ANGEL_MODEL_NAMES: readonly string[] = ANGEL_FISH.map((f) => angelModelName(f.id));

/** Gegenstände, deren Aussehen das Paket für Fänge austauscht (alle anderen bleiben unberührt). */
export const ANGEL_BASE_ITEMS: readonly string[] = [...new Set(ANGEL_FISH.map((f) => f.base))].sort();
