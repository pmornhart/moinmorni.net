/* eslint-disable ts-patterns/no-magic-numbers -- pixel art: skin layout and pixel rows as the 64×64 format needs them */
/**
 * Eigene Pixel-Skins für die Figuren der Lobby (Wirt, Kellnerin, Gäste, Modus-Figuren …). Jede Figur ist eine
 * Beschreibung ihrer Kleidung (`Outfit`); daraus entsteht ein 64×64-Skin im üblichen Aufbau (zwei Ebenen).
 * Keine fremden Skins, keine Vorlagen – alles hier gezeichnet.
 */
import { Picture } from './png.js';
import { random } from './noise.js';

export type HairStyle = 'short' | 'long' | 'braids' | 'bun' | 'bald';
export type HatKind =
  'tyrol' | 'straw' | 'party' | 'beanie' | 'helmet' | 'hood' | 'chef' | 'cap' | 'scarf' | 'crown';

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
  /** Rucksack-Gurte (Bergsteiger). */
  readonly straps?: number;
}

type Face = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back';
type Part = 'head' | 'body' | 'armR' | 'armL' | 'legR' | 'legL';
/** Farbe für ein Pixel: `y` von oben, `x` von links (von außen auf die Fläche geschaut); undefined = durchsichtig. */
type Paint = (part: Part, face: Face, x: number, y: number, w: number, h: number) => number | undefined;

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

const MOUTH = 0x8c4a3c;
const EYE_WHITE = 0xf4f1ea;
const BUTTON = 0xd8c48a;

function headBase(o: Outfit, face: Face, x: number, y: number): number {
  const hair = o.hair;
  const bald = o.hairStyle === 'bald';
  const long = o.hairStyle === 'long' || o.hairStyle === 'braids';
  if (face === 'top') return bald ? o.skin : hair;
  if (face === 'bottom') return o.beard ?? o.skin;
  if (face === 'back') {
    if (bald) return y < 2 ? shade(o.skin, 0.95) : o.skin;
    if (o.hairStyle === 'braids' && y >= 6) return x === 1 || x === 6 ? shade(hair, 0.85) : o.skin;
    return long || y < 6 ? hair : o.skin;
  }
  if (face === 'right' || face === 'left') {
    const toBack = face === 'right' ? x < 3 : x > 4;
    if (bald) return o.skin;
    if (long && (y < 7 || toBack)) return hair;
    if (y < 2 || (toBack && y < 6)) return hair;
    if (o.beard !== undefined && y >= 5 && !toBack) return o.beard;
    if (y === 4 && (face === 'right' ? x === 5 : x === 2)) return shade(o.skin, 0.88);
    return o.skin;
  }
  // Vorderseite: Haare, Augen, Nase, Mund, Bart
  if (!bald && y < 2) return hair;
  if (long && (x === 0 || x === 7) && y < 7) return hair;
  if (y === 3 && (x === 1 || x === 2 || x === 5 || x === 6))
    return bald ? shade(o.skin, 0.8) : shade(hair, 0.9);
  if (y === 4 && (x === 1 || x === 6)) return EYE_WHITE;
  if (y === 4 && (x === 2 || x === 5)) return o.eyes;
  if (o.beard !== undefined && y >= 5 && !(y === 6 && (x === 3 || x === 4))) {
    if (y > 5 || (x > 1 && x < 6)) return o.beard;
    return o.skin;
  }
  if (y === 5 && (x === 3 || x === 4)) return shade(o.skin, 0.9);
  if (y === 6 && (x === 3 || x === 4)) return MOUTH;
  return o.skin;
}

interface HatPixel {
  readonly face: Face;
  readonly side: boolean;
  readonly x: number;
  readonly y: number;
  readonly colour: number;
  readonly accent: number;
}

/** Hüte und Mützen auf der zweiten Kopf-Ebene. */
const HATS: Readonly<Record<HatKind, (p: HatPixel) => number | undefined>> = {
  tyrol: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top' || (side && y < 2)) return colour;
    if (side && y === 2) return accent;
    if (face === 'right' && y === 0 && x === 1) return 0xf2f2f2;
    return undefined;
  },
  straw: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top' || (side && y < 2)) return (x + y) % 2 === 0 ? colour : shade(colour, 0.9);
    if (side && y === 2) return accent;
    return undefined;
  },
  party: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top') return x > 2 && x < 5 && y > 2 && y < 5 ? 0xffffff : colour;
    if (side && y < 2) return (x + y) % 3 === 0 ? accent : colour;
    return undefined;
  },
  beanie: ({ face, side, y, colour, accent }) => {
    if (face === 'top' || (side && y < 2)) return colour;
    if (side && y === 2) return accent;
    return undefined;
  },
  helmet: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top') return x === 3 || x === 4 ? accent : colour;
    if (side && y < 2) return colour;
    if (side && y === 2) return accent;
    if (face === 'front' && y < 6 && (x === 3 || x === 4)) return accent;
    return undefined;
  },
  hood: ({ face, x, y, colour, accent }) => {
    if (face === 'top' || face === 'back') return colour;
    if ((face === 'right' || face === 'left') && y < 7) return colour;
    if (face === 'front' && (y < 2 || x === 0 || x === 7) && y < 7) return colour;
    if (face === 'front' && y === 2 && x > 0 && x < 7) return accent;
    return undefined;
  },
  chef: ({ face, side, y, colour }) => {
    if (face === 'top' || (side && y < 2)) return colour;
    if (side && y === 2) return shade(colour, 0.92);
    return undefined;
  },
  cap: ({ face, side, y, colour, accent }) => {
    if (face === 'top' || (side && y < 2)) return colour;
    if (face === 'front' && y === 2) return accent;
    return undefined;
  },
  scarf: ({ face, side, x, y, colour, accent }) => {
    if (face === 'top') return colour;
    if (side && y < 2) return (x + y) % 2 === 0 ? colour : accent;
    if (face === 'back' && y < 5) return colour;
    return undefined;
  },
  crown: ({ side, x, y, colour, accent }) => {
    if (!side || y > 1 || (y === 0 && x % 2 === 1)) return undefined;
    if (x === 3 && y === 1) return accent;
    return colour;
  },
};

function headOverlay(o: Outfit, face: Face, x: number, y: number): number | undefined {
  const hat = o.hat;
  if (!hat) {
    if (o.hairStyle === 'bun' && face === 'back' && y < 3 && x > 1 && x < 6) return shade(o.hair, 0.85);
    return undefined;
  }
  const side = face !== 'top' && face !== 'bottom';
  return HATS[hat.kind]({
    face,
    side,
    x,
    y,
    colour: hat.colour,
    accent: hat.accent ?? shade(hat.colour, 0.7),
  });
}

function bodyBase(o: Outfit, face: Face, x: number, y: number): number {
  const shirt = o.top.colour;
  if (o.bodice) {
    if (face === 'top') return y < 2 ? EYE_WHITE : o.bodice.colour;
    if (face === 'bottom') return o.bottom.colour;
    if (y < 3) return face === 'front' && y === 0 && x > 1 && x < 6 ? o.skin : EYE_WHITE;
    if (y < 8) {
      if (face === 'front' && (x === 3 || x === 4) && (y + x) % 2 === 1) return o.bodice.lacing;
      return o.bodice.colour;
    }
    if (o.apron !== undefined && face === 'front' && x > 0 && x < 7)
      return y === 8 ? shade(o.apron, 0.9) : o.apron;
    return y === 8 ? shade(o.bottom.colour, 0.85) : o.bottom.colour;
  }
  if (face === 'top') return shirt;
  if (face === 'bottom') return o.bottom.colour;
  const waist = o.bottom.kind === 'skirt' ? 8 : 9;
  if (o.belt !== undefined && y === waist) return face === 'front' && (x === 3 || x === 4) ? BUTTON : o.belt;
  if (y > waist || (y === waist && o.belt === undefined)) {
    if (o.apron !== undefined && face === 'front' && x > 0 && x < 7) return o.apron;
    return o.bottom.colour;
  }
  if (o.apron !== undefined && face === 'front' && x > 0 && x < 7 && y > 1)
    return y === 2 ? shade(o.apron, 0.9) : o.apron;
  if (o.apron !== undefined && (face === 'left' || face === 'right') && y === 6) return shade(o.apron, 0.9);
  if (o.braces !== undefined && o.vest === undefined && (face === 'front' || face === 'back')) {
    if ((x === 1 || x === 6) && y < waist) return o.braces;
    if (face === 'front' && y === 4 && x > 1 && x < 6) return shade(o.braces, 1.15);
  }
  if (o.straps !== undefined && face === 'front' && (x === 1 || x === 6)) return o.straps;
  if (o.straps !== undefined && face === 'back' && x > 0 && x < 7 && y > 0 && y < 8)
    return y === 1 ? shade(o.straps, 1.2) : o.straps;
  if (o.vest !== undefined) {
    if (face !== 'front') return o.vest;
    if (x < 2 || x > 5) return x === 1 && (y === 3 || y === 6) ? BUTTON : o.vest;
  }
  if (face === 'front' && y === 0 && x > 2 && x < 5) return o.skin;
  if (o.top.accent !== undefined && face === 'front' && (x === 3 || x === 4) && y > 0 && y < 8)
    return o.top.accent;
  return shirt;
}

function armBase(o: Outfit, face: Face, y: number): number {
  if (face === 'bottom') return o.skin;
  const sleeve = o.bodice ? EYE_WHITE : o.top.colour;
  const length = o.top.sleeves === 'long' ? 10 : 4;
  if (face === 'top') return o.vest !== undefined && o.top.sleeves === 'short' ? o.vest : sleeve;
  if (y < length) return y === length - 1 && o.top.sleeves === 'long' ? shade(sleeve, 0.88) : sleeve;
  return o.skin;
}

function legBase(o: Outfit, face: Face, x: number, y: number): number {
  const b = o.bottom;
  const socks = o.socks ?? b.colour;
  if (face === 'top') return b.colour;
  if (face === 'bottom') return o.shoes;
  if (y === 11) return o.shoes;
  if (b.kind === 'skirt') {
    if (y < 6) {
      if (o.apron !== undefined && face === 'front') return o.apron;
      return y === 5 ? shade(b.colour, 0.85) : b.colour;
    }
    return y < 8 ? o.skin : socks;
  }
  if (b.kind === 'lederhose') {
    if (y < 6) {
      if ((face === 'left' || face === 'right') && x === 1) return shade(b.colour, 1.18);
      if (face === 'front' && y === 1 && x === 1) return shade(b.colour, 0.75);
      return y === 5 ? shade(b.colour, 0.85) : b.colour;
    }
    if (y < 7) return o.skin;
    return y === 7 ? shade(socks, 0.9) : socks;
  }
  return y === 10 ? shade(b.colour, 0.85) : b.colour;
}

function painter(o: Outfit): { base: Paint; overlay: Paint } {
  const parts: Readonly<Record<Part, Paint>> = {
    head: (_p, face, x, y) => headBase(o, face, x, y),
    body: (_p, face, x, y) => bodyBase(o, face, x, y),
    armR: (_p, face, _x, y) => armBase(o, face, y),
    armL: (_p, face, _x, y) => armBase(o, face, y),
    legR: (_p, face, x, y) => legBase(o, face, x, y),
    legL: (_p, face, x, y) => legBase(o, face, x, y),
  };
  return {
    base: (part, face, x, y, w, h) => parts[part](part, face, x, y, w, h),
    overlay: (part, face, x, y) => (part === 'head' ? headOverlay(o, face, x, y) : undefined),
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
            const colour = paint(c.part, face, x, y, w, h);
            if (colour === undefined) return;
            const grain = 0.95 + rnd() * 0.08;
            const low = face !== 'top' && face !== 'bottom' && y === h - 1 ? 0.92 : 1;
            pic.set(fx + x, fy + y, shade(colour, grain * low));
          }),
        ),
      ),
    );
  draw(BASE, base);
  draw(OVERLAY, overlay);
  return pic;
}
