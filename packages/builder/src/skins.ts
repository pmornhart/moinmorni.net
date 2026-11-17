/* eslint-disable ts-patterns/no-magic-numbers -- pixel art: skin layout and pixel rows as the 64×64 format needs them */
/**
 * Eigene Pixel-Skins für die Figuren der Lobby (Wirt, Kellnerin, Gäste, Modus-Figuren …). Jede Figur ist eine
 * Beschreibung ihrer Kleidung (`Outfit`); daraus entsteht ein 64×64-Skin im üblichen Aufbau (zwei Ebenen).
 * Keine fremden Skins, keine Vorlagen – alles hier gezeichnet.
 *
 * Gezeichnet wird mit Licht von oben vorn: oben heller, unten und an den Kanten dunkler, Stoff mit feinem Korn.
 * - Gesicht: Brauen, Augen mit Weiß und Pupille (2 × 2), Nase, Wangen, Mund; Bart mit Schnurrbart.
 * - Haare: Strähnen und Schatten; Volumen und Pony auf der zweiten Ebene (darunter der Kopf in Hautfarbe).
 * - Kleidung: Kragen, Knopfleiste, Falten, Nähte, Gürtel mit Schnalle, Ärmel mit Bündchen, Hände mit Fingern,
 *   Schuhe mit Sohle und Schnürung. Westen, Hosenträger, Schürzen, Rucksack, Puffärmel, Bündchen und Stutzen liegen
 *   auf der zweiten Ebene – so stehen sie auch ohne Texturpaket etwas ab.
 * - Hüte liegen auf der zweiten Kopf-Ebene in den obersten drei Reihen (die 3D-Hüte aus `trachten.ts` umschließen
 *   genau diese Reihen).
 */
import { Picture } from './png.js';
import { random } from './noise.js';

export type HairStyle = 'short' | 'long' | 'braids' | 'bun' | 'bald';
export type HatKind =
  | 'tyrol'
  | 'straw'
  | 'party'
  | 'beanie'
  | 'helmet'
  | 'hood'
  | 'chef'
  | 'cap'
  | 'scarf'
  | 'crown'
  | 'aviator'
  // Modus-Figuren (17.11.): eigene Kopfbedeckungen, damit man jede Figur am Umriss erkennt
  | 'ranger'
  | 'band'
  | 'feather'
  | 'climb'
  | 'kettle'
  | 'tophat'
  | 'bowler'
  | 'pickel'
  | 'skibeanie'
  | 'bucket';

/**
 * Kostüm einer Modus-Figur (`figuren.ts`): zeichnet Pixel über die Grundkleidung – `base` auf die erste Ebene,
 * `overlay` auf die zweite. undefined = wie ohne Kostüm, `CLEAR` = auf der zweiten Ebene durchsichtig.
 */
export interface Costume {
  readonly base?: Paint;
  readonly overlay?: Paint;
}
/** Was über die Figur hinausragt (3D im Lobby-Paket, `trachten.ts`): Farbe je Teil. */
export interface Gear {
  /** Langer Umhang auf dem Rücken. */
  readonly cape?: number;
  /** Seilrolle auf dem Rücken. */
  readonly rope?: number;
  /** Schal mit langem Ende vorn. */
  readonly scarf?: number;
  /** Große Adlerschwingen auf dem Rücken. */
  readonly wings?: number;
  /** Ski über Kreuz auf dem Rücken (Farbe der Bretter). */
  readonly skis?: number;
  /** Schulterstücke aus Metall. */
  readonly pauldrons?: number;
}

export interface Outfit {
  readonly skin: number;
  readonly hair: number;
  readonly hairStyle: HairStyle;
  readonly eyes: number;
  readonly beard?: number;
  readonly hat?: { readonly kind: HatKind; readonly colour: number; readonly accent?: number };
  /** Hemd/Bluse/Kittel; `sleeves` short = kurze Ärmel. */
  readonly top: { readonly colour: number; readonly sleeves: 'long' | 'short'; readonly accent?: number };
  /** Weste oder Jacke (Vorderseite offen, Seiten und Rücken ganz). */
  readonly vest?: number;
  /** Hosenträger mit Steg (Lederhose). */
  readonly braces?: number;
  readonly apron?: number;
  /** Dirndl: Mieder (Oberteil) mit Schnürung. */
  readonly bodice?: { readonly colour: number; readonly lacing: number };
  readonly bottom: { readonly kind: 'lederhose' | 'trousers' | 'skirt'; readonly colour: number };
  readonly socks?: number;
  readonly shoes: number;
  readonly belt?: number;
  /** Rucksack-Gurte (Bergsteiger), hinten ein kleiner Rucksack. */
  readonly straps?: number;
  /** Kostüm (nur Modus-Figuren). */
  readonly costume?: Costume;
  /** 3D-Teile am Körper (nur Modus-Figuren). */
  readonly gear?: Gear;
}

type Face = SkinFace;
export type SkinFace = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back';
type Part = SkinPart;
export type SkinPart = 'head' | 'body' | 'armR' | 'armL' | 'legR' | 'legL';
/** Farbe für ein Pixel: `y` von oben, `x` von links (von außen auf die Fläche geschaut); undefined = durchsichtig. */
export type Paint = (part: Part, face: Face, x: number, y: number) => number | undefined;

interface Cuboid {
  readonly part: Part;
  readonly ox: number;
  readonly oy: number;
  readonly w: number;
  readonly h: number;
  readonly d: number;
}

const BASE: readonly Cuboid[] = [
  { part: 'head', ox: 0, oy: 0, w: 8, h: 8, d: 8 },
  { part: 'body', ox: 16, oy: 16, w: 8, h: 12, d: 4 },
  { part: 'armR', ox: 40, oy: 16, w: 4, h: 12, d: 4 },
  { part: 'armL', ox: 32, oy: 48, w: 4, h: 12, d: 4 },
  { part: 'legR', ox: 0, oy: 16, w: 4, h: 12, d: 4 },
  { part: 'legL', ox: 16, oy: 48, w: 4, h: 12, d: 4 },
];
const OVERLAY: readonly Cuboid[] = [
  { part: 'head', ox: 32, oy: 0, w: 8, h: 8, d: 8 },
  { part: 'body', ox: 16, oy: 32, w: 8, h: 12, d: 4 },
  { part: 'armR', ox: 40, oy: 32, w: 4, h: 12, d: 4 },
  { part: 'armL', ox: 48, oy: 48, w: 4, h: 12, d: 4 },
  { part: 'legR', ox: 0, oy: 32, w: 4, h: 12, d: 4 },
  { part: 'legL', ox: 0, oy: 48, w: 4, h: 12, d: 4 },
];

/** Flächen eines Quaders im Skin: [links, oben, Breite, Höhe]. */
function faces(c: Cuboid): readonly (readonly [Face, number, number, number, number])[] {
  const { ox, oy, w, h, d } = c;
  return [
    ['top', ox + d, oy, w, d],
    ['bottom', ox + d + w, oy, w, d],
    ['right', ox, oy + d, d, h],
    ['front', ox + d, oy + d, w, h],
    ['left', ox + d + w, oy + d, d, h],
    ['back', ox + 2 * d + w, oy + d, w, h],
  ];
}

/** Farbe heller (f > 1) oder dunkler (f < 1). */
export function shade(rgb: number, f: number): number {
  const ch = (s: number): number => Math.max(0, Math.min(255, Math.round(((rgb >> s) & 255) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Zwei Farben mischen (t = 0 → a, t = 1 → b). */
export function mix(a: number, b: number, t: number): number {
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Stoff, Haar, Leder: bekommt beim Zeichnen ein feines Korn (Haut, Augen und Knöpfe bleiben glatt). */
const GRAIN = 1 << 24;
export const cloth = (c: number): number => c | GRAIN;

const EYE_WHITE = 0xf4f1ea;
const EYE_SHADE = 0xd6d0c4;
const BUTTON = 0xd8c48a;
const BUTTON_DARK = 0x9c8650;
const SILVER = 0xc9ccd0;
const BLOUSE = 0xf3efe6;
const LIPS = 0xa04a44;
const LIPS_WOMAN = 0xc0505e;
const ROSE = 0xd9776a;
export const GOGGLE_GLASS = 0x7fbfd6;
export const GOGGLE_SHINE = 0xd8f1f8;
/** Kostüm: hier ist die zweite Ebene durchsichtig (auch wenn die Grundkleidung dort etwas malt). */
export const CLEAR = -1;

/** Hell, Grund, Schatten, tiefer Schatten einer Farbe. */
export interface Tones {
  readonly hi: number;
  readonly base: number;
  readonly lo: number;
  readonly deep: number;
}
export const tones = (c: number): Tones => ({
  hi: shade(c, 1.14),
  base: c,
  lo: shade(c, 0.82),
  deep: shade(c, 0.66),
});

/** Abstand zur Vorderkante auf einer Seitenfläche (0 = vorn): rechts liegt vorn bei x = Breite − 1. */
export const fromFront = (face: Face, x: number, w: number): number => (face === 'right' ? w - 1 - x : x);

// ---------------------------------------------------------------------------------------------------------------
// Kopf
// ---------------------------------------------------------------------------------------------------------------

/** Bis zu welcher Reihe das Haar hinten herunterreicht (zweite Ebene). */
const HAIR_BACK_END: Readonly<Record<HairStyle, number>> = { short: 5, bun: 5, bald: 0, braids: 7, long: 8 };

const isWoman = (o: Outfit): boolean =>
  o.bodice !== undefined || (o.beard === undefined && o.hairStyle !== 'short' && o.hairStyle !== 'bald');

/** Haar mit Strähnen: Spalten im Wechsel heller und dunkler, unten der Schatten. */
function hairAt(o: Outfit, x: number, y: number, bottom = 99): number {
  const h = tones(o.hair);
  if (y >= bottom) return cloth(h.lo);
  const strand = (x * 5 + Math.floor(y / 3) * 3) % 7;
  if (strand === 0) return cloth(h.hi);
  if (strand === 3 || strand === 5) return cloth(h.lo);
  return cloth(h.base);
}

function headFront(o: Outfit, x: number, y: number): number {
  const s = tones(o.skin);
  const bald = o.hairStyle === 'bald';
  const long = o.hairStyle === 'long' || o.hairStyle === 'braids';
  const edge = x === 0 || x === 7;
  const woman = isWoman(o);
  const browShade = o.hair > 0xa0a0a0 ? 0.72 : 0.78;
  const brow = bald ? shade(o.skin, 0.66) : shade(o.hair, browShade);
  if (!bald && y < 2) return hairAt(o, x, y, 1);
  if (long && edge && y < 7) return hairAt(o, x, y + 2);
  if (y === 2) return edge && !bald ? s.base : s.hi;
  if (y === 3) {
    if (x === 1 || x === 2 || x === 5 || x === 6) return woman && (x === 1 || x === 6) ? s.lo : brow;
    return s.base;
  }
  // Augen: Weiß außen, Iris innen, darunter Weiß im Schatten und die Pupille
  if (y === 4 && (x === 1 || x === 6)) return EYE_WHITE;
  if (y === 4 && (x === 2 || x === 5)) return shade(o.eyes, 1.08);
  if (y === 5 && (x === 1 || x === 6)) return EYE_SHADE;
  if (y === 5 && (x === 2 || x === 5)) return shade(o.eyes, 0.48);
  if (o.beard !== undefined && y >= 5) {
    const b = tones(o.beard);
    if (y === 5 && edge) return cloth(b.base);
    if (y === 5) return x === 3 || x === 4 ? s.lo : s.base;
    if (y === 6) return x >= 2 && x <= 5 ? cloth(b.lo) : cloth(b.base);
    if (x === 3 || x === 4) return mix(LIPS, b.deep, 0.35);
    return cloth(x === 1 || x === 6 ? b.hi : b.base);
  }
  if (y === 4) return edge ? s.lo : s.base;
  // Nase: Licht von links oben, Schatten rechts daneben
  if (y === 5) {
    if (x === 3) return s.hi;
    if (x === 4) return s.lo;
    return edge ? s.lo : s.base;
  }
  // Mund: gedämpft (ein knallroter Mund wirkt aus der Ferne wie eine Clownsnase), Mundwinkel, zarte Wangen
  if (y === 6) {
    if (x === 3 || x === 4) return mix(o.skin, woman ? LIPS_WOMAN : LIPS, woman ? 0.6 : 0.5);
    if (x === 2 || x === 5) return shade(o.skin, 0.88);
    if (x === 1 || x === 6) return mix(o.skin, ROSE, woman ? 0.3 : 0.14);
    return edge ? s.lo : s.base;
  }
  if (x === 3 || x === 4) return s.base;
  return edge ? s.deep : s.lo;
}

function headSide(o: Outfit, face: Face, x: number, y: number): number {
  const s = tones(o.skin);
  const f = fromFront(face, x, 8);
  const style = o.hairStyle;
  const ear = f === 4 && (y === 3 || y === 4);
  if (o.beard !== undefined && ((f <= 3 && y >= 4) || (f <= 5 && y >= 6))) {
    return cloth(y === 7 ? shade(o.beard, 0.82) : o.beard);
  }
  if (style === 'bald') {
    if (ear) return y === 3 ? s.lo : s.deep;
    if (y === 0) return s.hi;
    return y === 7 ? s.lo : s.base;
  }
  const hair =
    y < 2 ||
    (style === 'long' && !(f <= 1 && y >= 2)) ||
    (style === 'braids' && f >= 4) ||
    (f >= 5 && y < 6) ||
    (f >= 4 && y < 3) ||
    (f <= 1 && y === 2);
  if (hair && !(ear && style !== 'long')) return hairAt(o, f, y, style === 'long' ? 7 : 5);
  if (ear) return y === 3 ? s.lo : s.deep;
  return y === 7 || f >= 5 ? s.lo : s.base;
}

function headBack(o: Outfit, x: number, y: number): number {
  const s = tones(o.skin);
  const style = o.hairStyle;
  if (style === 'bald' && y === 0) return s.base;
  if (style === 'bald') return y === 7 ? s.deep : s.lo;
  if (style === 'long') return hairAt(o, x, y, 7);
  if (style === 'braids') {
    if (y < 7) return hairAt(o, x, y, 6);
    return x === 1 || x === 2 || x === 5 || x === 6 ? hairAt(o, x, y) : s.lo;
  }
  if (y < 5) return hairAt(o, x, y, 4);
  if (y === 5) return x >= 1 && x <= 6 ? cloth(shade(o.hair, 0.8)) : s.lo;
  return y === 6 ? s.lo : s.deep;
}

function headBase(o: Outfit, face: Face, x: number, y: number): number {
  if (face === 'top') {
    if (o.hairStyle === 'bald') return x === 3 && y < 3 ? shade(o.skin, 1.1) : shade(o.skin, 1.04);
    // Scheitel von vorn nach hinten, rundherum Strähnen
    if (x === 5 && y > 1) return cloth(shade(o.hair, 0.74));
    return hairAt(o, x + y, y);
  }
  if (face === 'bottom') return o.beard === undefined ? shade(o.skin, 0.74) : cloth(shade(o.beard, 0.8));
  if (face === 'front') return headFront(o, x, y);
  if (face === 'back') return headBack(o, x, y);
  return headSide(o, face, x, y);
}

interface HatPixel {
  readonly face: Face;
  readonly side: boolean;
  readonly f: number;
  readonly x: number;
  readonly y: number;
  readonly colour: number;
  readonly accent: number;
}

/**
 * Hüte und Mützen auf der zweiten Kopf-Ebene – nur die obersten drei Reihen (plus Scheitel), damit die 3D-Hüte des
 * Pakets sie umschließen. Ausnahmen: Helm (Nasenschutz), Kapuze und Kopftuch reichen tiefer.
 */
const HATS: Readonly<Record<HatKind, (p: HatPixel) => number | undefined>> = {
  tyrol: ({ face, side, f, y, colour, accent }) => {
    if (face === 'top') return cloth(shade(colour, 1.1));
    if (side && y === 0) return cloth(shade(colour, 1.06));
    if (side && y === 1) return cloth(colour);
    if (side && y === 2) return cloth(accent);
    if (face === 'right' && f === 5 && y === 0) return 0xf2f2f2;
    return undefined;
  },
  straw: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top' || (side && y < 2)) return (x + y) % 2 === 0 ? colour : shade(colour, 0.86);
    if (side && y === 2) return cloth(accent);
    return undefined;
  },
  party: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top') return x > 2 && x < 5 && y > 2 && y < 5 ? 0xffffff : cloth(colour);
    if (side && y < 2 && (x + y) % 3 === 0) return accent;
    if (side && y < 2) return cloth(y === 1 ? shade(colour, 0.9) : colour);
    return undefined;
  },
  beanie: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top') return cloth(x % 2 === 0 ? colour : shade(colour, 0.9));
    if (side && y < 2) return cloth(x % 2 === 0 ? colour : shade(colour, 0.9));
    if (side && y === 2) return cloth(accent);
    return undefined;
  },
  helmet: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top') return x === 3 || x === 4 ? accent : shade(colour, 1.08);
    if (face === 'front' && y < 5 && (x === 3 || x === 4)) return y < 3 ? accent : shade(accent, 0.9);
    if (side && y < 2) return y === 0 ? shade(colour, 1.08) : colour;
    if (side && y === 2) return accent;
    return undefined;
  },
  hood: ({ face, x, y, colour, accent }) => {
    const c = cloth(y === 0 ? shade(colour, 1.08) : colour);
    if (face === 'top' || face === 'back') return c;
    if ((face === 'right' || face === 'left') && y < 7) return c;
    if (face === 'front' && (y < 2 || x === 0 || x === 7) && y < 7) return c;
    if (face === 'front' && y === 2 && x > 0 && x < 7) return cloth(accent);
    return undefined;
  },
  chef: ({ face, side, y, colour }) => {
    if (face === 'top' || (side && y < 2)) return cloth(colour);
    if (side && y === 2) return shade(colour, 0.9);
    return undefined;
  },
  cap: ({ face, side, y, colour, accent }) => {
    if (face === 'top' || (side && y < 2)) return cloth(y === 1 ? shade(colour, 0.9) : colour);
    if (face === 'front' && y === 2) return cloth(accent);
    return undefined;
  },
  scarf: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top') return cloth(colour);
    if (side && y < 2) return (x + y) % 2 === 0 ? cloth(colour) : cloth(accent);
    if (face === 'back' && y < 5) return cloth(y === 4 ? shade(colour, 0.85) : colour);
    return undefined;
  },
  // Fliegerhaube aus Leder: Brille auf der Stirn (Gläser hell, Rahmen in der Zierfarbe), Ohrenklappen
  aviator: ({ face, side, f, x, y, colour, accent }) => {
    const seam = x === 3 || x === 4;
    if (face === 'top') return cloth(seam ? shade(colour, 0.8) : shade(colour, 1.08));
    if (face === 'front' && y === 2) {
      if (x === 1 || x === 5) return GOGGLE_GLASS;
      if (x === 2 || x === 6) return GOGGLE_SHINE;
      return accent;
    }
    if (side && y < 2) return cloth(y === 0 ? shade(colour, 1.08) : colour);
    if (side && face !== 'front' && y === 2) return shade(accent, 0.75);
    if ((face === 'right' || face === 'left') && y > 2 && y < 7 && f >= 3 && f <= 5)
      return cloth(y === 6 ? shade(colour, 0.8) : colour);
    return undefined;
  },
  crown: ({ side, x, y, colour, accent }) => {
    if (!side || y > 1 || (y === 0 && x % 2 === 1)) return undefined;
    if (x === 3 && y === 1) return accent;
    return y === 0 ? shade(colour, 1.1) : colour;
  },
  // Abenteurer-Hut mit breiter Krempe (das Paket gibt Krempe und Feder dazu)
  ranger: ({ face, side, y, colour, accent }) => {
    if (face === 'top') return cloth(shade(colour, 1.1));
    if (side && y < 2) return cloth(y === 0 ? shade(colour, 1.06) : colour);
    if (side && y === 2) return cloth(accent);
    return undefined;
  },
  // Stirnband: nur die dritte Reihe, darüber das eigene Haar
  band: ({ side, face, y, colour }) => (side && face !== 'bottom' && y === 2 ? cloth(colour) : undefined),
  feather: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top') return cloth((x + y) % 4 === 0 ? shade(colour, 1.15) : colour);
    if (side && y < 2) return cloth(y === 0 ? shade(colour, 1.08) : colour);
    if (side && y === 2) return cloth(accent);
    return undefined;
  },
  // Kletterhelm mit hellem Streifen und Stirnlampe
  climb: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top') return x === 3 || x === 4 ? 0xf2f2f2 : shade(colour, 1.08);
    if (face === 'front' && y === 1 && (x === 3 || x === 4)) return 0xfff2a0;
    if (side && y < 2) return y === 0 ? shade(colour, 1.08) : colour;
    if (side && y === 2) return shade(accent, 0.9);
    return undefined;
  },
  // Eisenhut der Stadtwache
  kettle: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top') return (x + y) % 5 === 0 ? shade(colour, 1.18) : shade(colour, 1.06);
    if (side && y < 2) return y === 0 ? shade(colour, 1.1) : colour;
    if (side && y === 2) return accent;
    return undefined;
  },
  tophat: ({ face, side, y, colour, accent }) => {
    if (face === 'top') return cloth(shade(colour, 1.12));
    if (side && y < 2) return cloth(colour);
    if (side && y === 2) return cloth(accent);
    return undefined;
  },
  // Melone mit Fliegerbrille um den Hut
  bowler: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top') return cloth(shade(colour, 1.1));
    if (face === 'front' && y === 2 && (x === 1 || x === 5)) return GOGGLE_GLASS;
    if (face === 'front' && y === 2 && (x === 2 || x === 6)) return GOGGLE_SHINE;
    if (side && y === 2) return accent;
    if (side && y < 2) return cloth(y === 0 ? shade(colour, 1.08) : colour);
    return undefined;
  },
  // Pickelhaube: schwarzes Leder, vorn ein goldenes Schild, oben der Spitz
  pickel: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top') return (x === 3 || x === 4) && (y === 3 || y === 4) ? accent : shade(colour, 1.2);
    if (face === 'front' && y < 2 && x > 1 && x < 6)
      return y === 0 && (x === 2 || x === 5) ? shade(accent, 0.8) : accent;
    if (side && y < 2) return y === 0 ? shade(colour, 1.25) : colour;
    if (side && y === 2) return face === 'front' ? shade(colour, 0.8) : shade(accent, 0.7);
    return undefined;
  },
  // Bommelmütze mit Skibrille auf der Stirn
  skibeanie: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top') return cloth(x % 2 === 0 ? colour : shade(colour, 0.92));
    if (face === 'front' && y === 2 && x > 0 && x < 7) return x === 1 || x === 4 ? 0xffe2a6 : 0xf2a03a;
    if (side && y === 2) return 0x26262c;
    if (side && y === 1) return cloth(accent);
    if (side && y === 0) return cloth(x % 2 === 0 ? colour : shade(colour, 0.92));
    return undefined;
  },
  // Fischerhut mit Hutband und einem bunten Köder
  bucket: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top') return cloth(shade(colour, 1.08));
    if (face === 'front' && y === 2 && x === 6) return 0xe0402a;
    if (side && y < 2) return cloth(y === 0 ? shade(colour, 1.05) : colour);
    if (side && y === 2) return cloth(accent);
    return undefined;
  },
};

/** Haar-Volumen auf der zweiten Ebene (ohne Hut ganz, mit Hut nur unterhalb der Hutreihen). */
function hairOverlay(o: Outfit, face: Face, x: number, y: number, under: number): number | undefined {
  const style = o.hairStyle;
  if (style === 'bald' || y < under) return undefined;
  const lighter = (c: number): number => cloth(shade(c & 0xffffff, 1.08));
  if (face === 'top') return under > 0 ? undefined : lighter(hairAt(o, x * 3 + y, y));
  if (face === 'front') {
    if (y === 0) return lighter(hairAt(o, x, y));
    // Pony: unregelmäßige Strähnen über der Stirn
    const gap = x === 3 || (style === 'bun' && x === 4);
    if (y === 1) return gap ? undefined : hairAt(o, x, y, 1);
    if (y === 2 && (x === 0 || x === 7)) return hairAt(o, x, y, 2);
    if ((style === 'long' || style === 'braids') && (x === 0 || x === 7) && y < 7)
      return hairAt(o, x, y + 1, 6);
    return undefined;
  }
  if (face === 'back') {
    const end = HAIR_BACK_END[style];
    if (y >= end) return undefined;
    if (style === 'bun' && y < 4 && x > 1 && x < 6)
      return cloth(shade(o.hair, y === 0 || y === 3 ? 0.78 : 0.9));
    return y === end - 1 && (x === 0 || x === 7) ? undefined : hairAt(o, x + 1, y, end - 1);
  }
  if (face === 'bottom') return undefined;
  const f = fromFront(face, x, 8);
  if (y < 2) return hairAt(o, f, y);
  if (style === 'long') return f <= 1 || y >= 7 ? undefined : hairAt(o, f, y, 6);
  if (y === 2 && f >= 3) return hairAt(o, f, y);
  if (y === 2) return f === 0 ? hairAt(o, f, y, 2) : undefined;
  if (y < 5 && f >= 5) return hairAt(o, f, y, 4);
  return undefined;
}

function headOverlay(o: Outfit, face: Face, x: number, y: number): number | undefined {
  const hat = o.hat;
  if (!hat) return hairOverlay(o, face, x, y, 0);
  const side = face !== 'top' && face !== 'bottom';
  const f = side && face !== 'front' && face !== 'back' ? fromFront(face, x, 8) : 0;
  const pixel = HATS[hat.kind]({
    face,
    side,
    f,
    x,
    y,
    colour: hat.colour,
    accent: hat.accent ?? shade(hat.colour, 0.7),
  });
  if (pixel !== undefined) return pixel;
  // Unter dem Hut schaut das Haar hervor (nicht bei Kapuze und Kopftuch).
  return hat.kind === 'hood' || hat.kind === 'scarf' ? undefined : hairOverlay(o, face, x, y, 3);
}

// ---------------------------------------------------------------------------------------------------------------
// Körper
// ---------------------------------------------------------------------------------------------------------------

/** Wo die Hose bzw. der Rock am Körper beginnt (Reihe des Bunds). */
const waistOf = (o: Outfit): number => (o.bodice || o.bottom.kind === 'skirt' ? 8 : 9);

/** Hemd mit Licht und Falten. */
function shirtAt(o: Outfit, face: Face, x: number, y: number, w: number): number {
  const t = tones(o.top.colour);
  const edge = x === 0 || x === w - 1;
  if (y === 0 && (face === 'front' || face === 'back')) return cloth(edge ? t.base : t.hi);
  // Falten zur Taille hin, unter den Armen und am Rücken zwischen den Schulterblättern
  const waistFold = (y === 7 && (x === 1 || x === w - 2)) || (y === 8 && (x === 2 || x === w - 3));
  if (face === 'front' && waistFold) return cloth(t.lo);
  if (face === 'back' && ((y === 2 && (x === 2 || x === 5)) || (y === 3 && (x === 3 || x === 4))))
    return cloth(t.lo);
  if (face === 'back' && y === 1 && x > 0 && x < w - 1) return cloth(t.hi);
  // Naht an der Seite
  if ((face === 'right' || face === 'left') && x === 2 && y > 1) return cloth(t.lo);
  if (edge && face !== 'top') return cloth(y < 3 ? t.base : t.lo);
  if (y === 1 && (x === 1 || x === w - 2)) return cloth(t.hi);
  return cloth(y > 5 ? shade(o.top.colour, 0.93) : t.base);
}

/** Hose, Lederhose oder Rock am Körper (Hüfte). */
function bottomOnBody(o: Outfit, face: Face, x: number, y: number, w: number): number {
  const b = tones(o.bottom.colour);
  const edge = x === 0 || x === w - 1;
  if (o.bottom.kind === 'lederhose' && face === 'front') {
    // Hosenlatz mit Naht
    if ((x === 2 || x === 5) && y >= 10) return cloth(b.hi);
    if (x > 2 && x < 5 && y === 10) return BUTTON_DARK;
    return cloth(edge ? b.lo : b.base);
  }
  if (o.bottom.kind === 'skirt') {
    if (o.apron !== undefined && face === 'front' && x > 0 && x < w - 1) return cloth(apronAt(o.apron, x, y));
    const fold = (x + Number(face === 'back')) % 2 === 0;
    return cloth(fold ? b.base : b.lo);
  }
  if (edge) return cloth(b.lo);
  return cloth(y === 11 ? shade(o.bottom.colour, 0.92) : b.base);
}

/** Schürze mit feinem Karo. */
function apronAt(apron: number, x: number, y: number): number {
  return (x + y) % 3 === 0 ? shade(apron, 0.9) : apron;
}

function bodyBase(o: Outfit, face: Face, x: number, y: number): number {
  const w = face === 'front' || face === 'back' || face === 'top' || face === 'bottom' ? 8 : 4;
  const waist = waistOf(o);
  if (face === 'top') return cloth(o.bodice ? BLOUSE : shade(o.top.colour, 1.1));
  if (face === 'bottom') return cloth(o.bottom.colour);
  if (o.bodice) return dirndlBody(o, face, x, y, w);
  if (y > waist) return bottomOnBody(o, face, x, y, w);
  if (y === waist) {
    if (o.belt !== undefined) {
      if (face === 'front' && (x === 3 || x === 4)) return x === 3 ? BUTTON : BUTTON_DARK;
      return cloth(shade(o.belt, x % 3 === 0 ? 0.85 : 1));
    }
    return o.bottom.kind === 'lederhose'
      ? cloth(shade(o.bottom.colour, 0.85))
      : cloth(shade(o.top.colour, 0.8));
  }
  if (face === 'front') {
    // Hals und Kragen
    if (y === 0 && (x === 3 || x === 4)) return shade(o.skin, 0.9);
    if (y === 0 && (x === 2 || x === 5)) return cloth(shade(o.top.accent ?? o.top.colour, 1.12));
    if (y === 1 && (x === 3 || x === 4) && o.top.accent === undefined) return shade(o.skin, 0.84);
    // Knopfleiste
    if (o.top.accent !== undefined && (x === 3 || x === 4) && y > 0) {
      if (x === 3 && y % 2 === 0) return BUTTON;
      return cloth(x === 3 ? shade(o.top.accent, 1.06) : shade(o.top.accent, 0.88));
    }
    if (o.top.accent === undefined && x === 4 && y > 1 && y % 2 === 0) return shade(o.top.colour, 0.8);
  }
  return shirtAt(o, face, x, y, w);
}

/** Dirndl: Bluse, Mieder mit Schnürung und Borte, Rock mit Falten, Schürze. */
function dirndlBody(o: Outfit, face: Face, x: number, y: number, w: number): number {
  const bodice = o.bodice!;
  const m = tones(bodice.colour);
  const edge = x === 0 || x === w - 1;
  if (y < 3) {
    if (face === 'front' && y === 0 && x > 1 && x < 6) return shade(o.skin, x === 2 || x === 5 ? 0.92 : 1);
    if (face === 'front' && y === 1 && (x === 3 || x === 4)) return shade(o.skin, 0.9);
    return cloth(y === 2 ? 0xe4ddd0 : BLOUSE);
  }
  if (y < 8) {
    if (face === 'front') {
      if (y === 3) return cloth(x === 0 || x === 7 ? m.lo : shade(bodice.lacing, 0.95));
      if ((x === 3 || x === 4) && (y + x) % 2 === 1) return bodice.lacing;
      if (x === 3 || x === 4) return shade(BLOUSE, 0.92);
      if (x === 2 || x === 5) return cloth(m.hi);
    }
    if (face === 'back' && (x === 3 || x === 4) && y > 3) return cloth(m.lo);
    return cloth(edge ? m.lo : m.base);
  }
  if (y === 8) {
    if (o.apron !== undefined && face === 'front' && x > 0 && x < 7) return cloth(shade(o.apron, 0.86));
    return cloth(m.deep);
  }
  return bottomOnBody(o, face, x, y, w);
}

/**
 * Zweite Körper-Ebene (Jacke): Weste, Hosenträger, Schürze mit Latz, Rucksack-Gurte und Rucksack – alles, was über
 * dem Hemd liegt.
 */
function bodyOverlay(o: Outfit, face: Face, x: number, y: number): number | undefined {
  const w = face === 'front' || face === 'back' || face === 'top' || face === 'bottom' ? 8 : 4;
  const waist = waistOf(o);
  if (o.vest !== undefined) {
    const v = tones(o.vest);
    if (face === 'top') return x < 2 || x > 5 ? cloth(v.hi) : undefined;
    if (y > waist) return undefined;
    if (face === 'front') {
      if (x > 1 && x < 6) {
        // Revers am Ausschnitt
        if (y < 2 && (x === 2 || x === 5)) return cloth(v.deep);
        return undefined;
      }
      if (x === 1 && (y === 3 || y === 5 || y === 7)) return BUTTON;
      if (y === 7 && (x === 0 || x === 7)) return cloth(v.deep);
      if (y === waist) return cloth(v.lo);
      return cloth(x === 0 || x === 7 ? v.lo : v.base);
    }
    if (face === 'back' && y === 6 && x > 1 && x < 6) return cloth(v.deep);
    if (y === 0) return cloth(v.hi);
    return cloth(x === 0 || x === w - 1 ? v.lo : v.base);
  }
  if (o.braces !== undefined && !o.bodice) {
    const b = tones(o.braces);
    if (face === 'top') return x === 1 || x === 6 ? cloth(b.hi) : undefined;
    if (y >= waist) return undefined;
    if (face === 'front') {
      if (x === 1 || x === 6) return cloth(y === 0 ? b.hi : b.base);
      // Steg mit Verzierung
      if (y === 4 && x > 1 && x < 6) return x === 3 || x === 4 ? cloth(shade(o.braces, 1.35)) : cloth(b.base);
      return undefined;
    }
    if (face === 'back') {
      if (y < 4) return x === 3 || x === 4 ? cloth(b.base) : undefined;
      // Über Kreuz zum Bund hinunter
      const cross = (y - 4 === 3 - x || y - 4 === x - 4) && x !== 0 && x !== 7;
      return cross || ((x === 1 || x === 6) && y > 6) ? cloth(b.base) : undefined;
    }
    return undefined;
  }
  if (o.straps !== undefined) {
    const r = tones(o.straps);
    const pack = shade(o.straps, 0.7);
    if (face === 'front') {
      if ((x === 1 || x === 6) && y < waist) return cloth(y === 0 ? r.hi : r.base);
      if (y === 3 && x > 1 && x < 6) return x === 3 || x === 4 ? SILVER : cloth(r.lo);
      return undefined;
    }
    if (face === 'back') {
      if (y < 1 || y > 8 || x < 1 || x > 6) return undefined;
      if (y === 1) return cloth(shade(pack, 1.2));
      if (y === 3) return x === 3 || x === 4 ? SILVER : cloth(shade(pack, 1.1));
      return cloth(x === 1 || x === 6 || y === 8 ? shade(pack, 0.8) : pack);
    }
    if (face === 'top') return x === 1 || x === 6 ? cloth(r.hi) : undefined;
    // Rucksack von der Seite: die hintere Spalte
    const sideOfPack = (face === 'right' || face === 'left') && y > 0 && y < 9 && fromFront(face, x, 4) === 3;
    return sideOfPack ? cloth(pack) : undefined;
  }
  // Arbeitsschürze mit Latz (Bäcker, Schmied, Krämer)
  if (o.apron !== undefined && !o.bodice && o.bottom.kind !== 'skirt') {
    const a = tones(o.apron);
    if (face === 'front') {
      if (y < 2) return x === 1 || x === 6 ? cloth(a.lo) : undefined;
      if (x < 1 || x > 6) return undefined;
      if (y === 7) return cloth(a.lo);
      return cloth(apronAt(o.apron, x, y));
    }
    if ((face === 'right' || face === 'left') && y === 7) return cloth(a.lo);
    if (face === 'back' && y === 7) return cloth(a.lo);
    return undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Arme
// ---------------------------------------------------------------------------------------------------------------

function armBase(o: Outfit, part: Part, face: Face, x: number, y: number): number {
  const s = tones(o.skin);
  const sleeve = o.bodice ? BLOUSE : o.top.colour;
  const t = tones(sleeve);
  const long = o.top.sleeves === 'long';
  // Innenseite (zum Körper) etwas dunkler
  const inner = (part === 'armR' && face === 'left') || (part === 'armL' && face === 'right');
  if (face === 'top') return cloth(t.hi);
  if (face === 'bottom') return s.lo;
  const end = long ? 9 : 4;
  if (y < end) {
    if (long && y === end - 1) return cloth(o.top.accent !== undefined ? shade(o.top.accent, 0.95) : t.lo);
    if (!long && y === end - 1) return cloth(t.lo);
    if (y === 0) return cloth(t.hi);
    // Falte in der Armbeuge
    if (long && face === 'front' && y === 5 && x === 1) return cloth(shade(sleeve, 0.92));
    return cloth(inner ? t.lo : t.base);
  }
  // Hand: Daumen innen vorn, unten die Finger
  if (y >= 10) {
    const finger = (x + Number(face !== 'front')) % 2 === 0;
    if (y === 11) return finger ? s.lo : s.deep;
    const thumb = face === 'front' && ((part === 'armR' && x === 3) || (part === 'armL' && x === 0));
    if (thumb) return s.hi;
    return inner ? s.lo : s.base;
  }
  if (!long && (y === 6 || y === 7) && face === 'back') return s.lo;
  return inner ? s.lo : s.base;
}

function armOverlay(o: Outfit, _part: Part, face: Face, x: number, y: number): number | undefined {
  if (face === 'bottom') return undefined;
  if (o.bodice) {
    // Puffärmel mit Spitze
    if (face === 'top') return cloth(BLOUSE);
    if (y < 3) return cloth(y === 0 ? BLOUSE : shade(BLOUSE, 0.95));
    const lace = (x + Number(face !== 'front')) % 2 === 0;
    if (y === 3) return lace ? 0xffffff : undefined;
    return undefined;
  }
  const long = o.top.sleeves === 'long';
  const cuff = o.top.accent ?? shade(o.top.colour, 0.8);
  if (long && face !== 'top' && (y === 8 || y === 9))
    return cloth(y === 8 ? shade(cuff, 1.05) : shade(cuff, 0.9));
  if (!long && face !== 'top' && y === 3) return cloth(shade(o.top.colour, 0.92));
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Beine
// ---------------------------------------------------------------------------------------------------------------

/** Schuh: Oberleder mit Schnürung bzw. Schnalle, dunkle Sohle, vorne eine glänzende Kappe. */
function shoeAt(o: Outfit, face: Face, x: number, y: number): number {
  const sh = tones(o.shoes);
  if (face === 'bottom') return shade(o.shoes, 0.5);
  if (y === 11) return shade(o.shoes, 0.55);
  if (face === 'front') {
    if (o.bottom.kind === 'skirt') return x === 1 || x === 2 ? SILVER : sh.base;
    return x === 1 || x === 2 ? shade(sh.hi, 1.1) : sh.base;
  }
  return face === 'back' ? sh.lo : sh.base;
}

/** Wadlstrümpfe mit Zopfmuster. */
function sockAt(socks: number, face: Face, x: number, y: number): number {
  if (face === 'front' && (x === 1 || x === 2))
    return cloth((y + x) % 2 === 0 ? shade(socks, 1.06) : shade(socks, 0.86));
  return cloth(y % 2 === 0 ? socks : shade(socks, 0.94));
}

function legBase(o: Outfit, part: Part, face: Face, x: number, y: number): number {
  const b = tones(o.bottom.colour);
  const s = tones(o.skin);
  const socks = o.socks ?? o.bottom.colour;
  const outer = (part === 'legR' && face === 'right') || (part === 'legL' && face === 'left');
  const inner = (part === 'legR' && face === 'left') || (part === 'legL' && face === 'right');
  if (face === 'top') return cloth(b.base);
  if (y >= 10 || face === 'bottom') return shoeAt(o, face, x, y);
  if (o.bottom.kind === 'skirt') {
    if (y < 6) {
      if (o.apron !== undefined && face === 'front') return cloth(apronAt(o.apron, x, y));
      if (y === 5) return cloth(b.deep);
      return cloth(x % 2 === 0 ? b.base : b.lo);
    }
    if (y < 8) return y === 6 ? s.base : s.lo;
    return sockAt(socks, face, x, y);
  }
  if (o.bottom.kind === 'lederhose') {
    if (y < 6) {
      // Naht außen, Latz oben vorn, Hirschhornknöpfe am Knie
      if (outer && x === 1) return cloth(b.hi);
      if (face === 'front' && y < 2 && (part === 'legR' ? x === 3 : x === 0)) return cloth(b.hi);
      if (y === 5) return outer && x === 2 ? 0xe8e0cc : cloth(b.deep);
      return cloth(inner ? b.lo : b.base);
    }
    if (y === 6) return s.lo;
    return sockAt(socks, face, x, y);
  }
  // Stoffhose: Bügelfalte vorn, Saum unten
  if (y === 9) return cloth(b.lo);
  if (face === 'front' && (part === 'legR' ? x === 2 : x === 1)) return cloth(b.hi);
  if (face === 'front' && y === 5 && (x === 1 || x === 2)) return cloth(b.lo);
  return cloth(inner ? b.lo : b.base);
}

function legOverlay(o: Outfit, part: Part, face: Face, x: number, y: number): number | undefined {
  if (face === 'top' || face === 'bottom') return undefined;
  if (o.bottom.kind === 'skirt') {
    // Rock und Schürze stehen etwas ab (mit Paket kommt der 3D-Rock darüber)
    if (y > 5) return undefined;
    if (o.apron !== undefined && face === 'front') return cloth(apronAt(o.apron, x + 1, y));
    if (y === 5) return cloth(shade(o.bottom.colour, 0.72));
    // Falten senkrecht nach unten
    return cloth(x % 2 === 0 ? shade(o.bottom.colour, 1.04) : shade(o.bottom.colour, 0.84));
  }
  if (o.bottom.kind === 'lederhose') {
    if (y === 5) return cloth(shade(o.bottom.colour, 0.8));
    if (y === 7 && o.socks !== undefined) return cloth(shade(o.socks, 0.92));
    return undefined;
  }
  // Schürze über der Stoffhose (vorn, bis übers Knie)
  if (o.apron !== undefined && face === 'front' && y < 7) {
    const innerColumn = part === 'legR' ? x >= 1 : x <= 2;
    return innerColumn ? cloth(apronAt(o.apron, x, y + 2)) : undefined;
  }
  return undefined;
}

function painter(o: Outfit): { base: Paint; overlay: Paint } {
  const plain = plainPainter(o);
  const costume = o.costume;
  if (!costume) return plain;
  return {
    base: (part, face, x, y) => costume.base?.(part, face, x, y) ?? plain.base(part, face, x, y),
    overlay: (part, face, x, y) => {
      const own = costume.overlay?.(part, face, x, y);
      if (own === CLEAR) return undefined;
      return own ?? plain.overlay(part, face, x, y);
    },
  };
}

function plainPainter(o: Outfit): { base: Paint; overlay: Paint } {
  return {
    base: (part, face, x, y) => {
      if (part === 'head') return headBase(o, face, x, y);
      if (part === 'body') return bodyBase(o, face, x, y);
      if (part === 'armR' || part === 'armL') return armBase(o, part, face, x, y);
      return legBase(o, part, face, x, y);
    },
    overlay: (part, face, x, y) => {
      if (part === 'head') return headOverlay(o, face, x, y);
      if (part === 'body') return bodyOverlay(o, face, x, y);
      if (part === 'armR' || part === 'armL') return armOverlay(o, part, face, x, y);
      return legOverlay(o, part, face, x, y);
    },
  };
}

/** 64×64-Skin für ein Outfit; `seed` gibt dem Stoff ein leichtes Muster (gleiches Outfit = gleiches Bild). */
export function skinPicture(o: Outfit, seed = 1): Picture {
  const pic = new Picture(64, 64);
  const rnd = random(seed);
  const { base, overlay } = painter(o);
  const draw = (cubes: readonly Cuboid[], paint: Paint): void =>
    cubes.forEach((c) =>
      faces(c).forEach(([face, fx, fy, w, h]) =>
        Array.from({ length: h }).forEach((_, y) =>
          Array.from({ length: w }).forEach((__, x) => {
            const value = paint(c.part, face, x, y);
            if (value === undefined) return;
            const grain = value & GRAIN ? 0.955 + rnd() * 0.07 : 1;
            pic.set(fx + x, fy + y, shade(value & 0xffffff, grain));
          }),
        ),
      ),
    );
  draw(BASE, base);
  draw(OVERLAY, overlay);
  return pic;
}
