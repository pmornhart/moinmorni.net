/* eslint-disable ts-patterns/no-magic-numbers -- Modell-Maße in Skin-Pixeln bzw. 1/16 Block (Minecraft-Modellkoordinaten) */
/**
 * Trachten in 3D für die Figuren der Lobby (Ressourcenpaket): Frisuren, Bärte und Hüte auf dem Kopf, Dirndl
 * (Rock, Schürze, Mieder), Westen und Hosenträger am Körper.
 *
 * Der Kniff: Alle Teile sind Gegenstände mit dem Modell `minecraft:air` – das ist in Minecraft leer. Ohne unser Paket
 * (oder auf Bedrock) sieht man also gar nichts davon, nur den gewohnten Skin. Unser Paket ersetzt `items/air.json`:
 * Dort wählt `custom_model_data` (Texte) die Teile aus, die Farben kommen aus `custom_model_data` (Farben) – so reicht
 * ein Modell pro Frisur/Hut/Kleidungsstück für alle Farben der Figuren.
 *
 * - Kopf: im Kopf-Platz der Figur; dreht und nickt mit dem Kopf. Modellraum: der Kopf liegt in [1,6 … 14,4], vorne = z
 *   klein, ein Skin-Pixel = 1,6.
 * - Körper: ein Anzeige-Objekt, das auf der Figur „mitfährt“ (Passagier). Modellraum = Skin-Pixel, Füße bei y 0,
 *   Körper x 4…12, z 6…10, vorne = z klein. Das Lobby-Plugin dreht es mit der Figur mit.
 *
 * Alles hier ist selbst gezeichnet (Texturen als Pixel-Muster), nichts von Mojang.
 */
import type { Outfit } from './skins.js';
import { Picture } from './png.js';
import { random } from './noise.js';

type Vec = readonly [number, number, number];
type Face = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
const FACES: readonly Face[] = ['north', 'south', 'east', 'west', 'up', 'down'];
export const TRACHT_NS = 'morninet';

/** Eigene Texturen (16×16), hell gezeichnet – die Farbe kommt beim Zeichnen dazu (`tint`). */
type TexName = 'haar' | 'filz' | 'stroh' | 'stoff' | 'schuerze' | 'schnuerung' | 'feder' | 'metall' | 'band';
interface Part {
  readonly from: Vec;
  readonly to: Vec;
  readonly tex: TexName;
  /** Welche Farbe der Figur (Index in den Farben des Teils); ohne = Textur so wie sie ist. */
  readonly tint?: number;
  readonly rotation?: { readonly angle: number; readonly axis: 'x' | 'y' | 'z'; readonly origin: Vec };
}
const p = (from: Vec, to: Vec, tex: TexName, tint?: number, rotation?: Part['rotation']): Part => ({
  from,
  to,
  tex,
  ...(tint === undefined ? {} : { tint }),
  ...(rotation ? { rotation } : {}),
});

// ---------------------------------------------------------------------------------------------------------------
// Kopf: ein Skin-Pixel = 1,6 Einheiten, der Kopf liegt in [1,6 … 14,4]. `h(px)` = Kante bei Pixel px (0 … 8).
// ---------------------------------------------------------------------------------------------------------------
const PX = 1.6;
const LO = 1.6;
const HI = 14.4;
const h = (px: number): number => LO + px * PX;
/** Haare liegen eine halbe Pixelbreite über dem Skin (wie die zweite Ebene), damit nichts flimmert. */
const OUT = 0.8;

const HAIR_CAP: readonly Part[] = [
  p([LO - OUT, HI, LO - OUT], [HI + OUT, HI + 1.2, HI + OUT], 'haar', 0), // oben
  p([LO - OUT, h(4.5), HI], [HI + OUT, HI + OUT, HI + OUT], 'haar', 0), // Hinterkopf
  p([LO - OUT, h(5), LO - OUT], [LO, HI + OUT, HI], 'haar', 0), // Seiten über den Ohren
  p([HI, h(5), LO - OUT], [HI + OUT, HI + OUT, HI], 'haar', 0),
  p([LO, h(7), LO - OUT], [HI, HI + 0.4, LO], 'haar', 0), // Pony
];

/** Zopf: Glieder abwechselnd versetzt, unten eine Schleife (Farbe 1 = Band). */
function braid(x: number, side: 1 | -1): Part[] {
  const links = Array.from({ length: 7 }, (_, i) => {
    const top = LO - i * 2.2;
    const shift = i % 2 === 0 ? 0 : 0.5 * side;
    return p([x + shift, top - 2.4, 11.6], [x + shift + 2.4, top, 14], 'haar', 0);
  });
  return [...links, p([x - 0.4, LO - 17.4, 11.2], [x + 2.8, LO - 15.6, 14.4], 'band', 1)];
}

const HAIR: Readonly<Record<'short' | 'long' | 'braids' | 'bun', readonly Part[]>> = {
  short: HAIR_CAP,
  long: [
    ...HAIR_CAP,
    p([LO - OUT, LO - 10, HI - 1.6], [HI + OUT, h(4.5), HI + OUT], 'haar', 0), // lang den Rücken hinunter
    p([LO - OUT, LO - 3, LO + 4], [LO, h(5), HI], 'haar', 0), // Strähnen seitlich bis zur Schulter
    p([HI, LO - 3, LO + 4], [HI + OUT, h(5), HI], 'haar', 0),
  ],
  braids: [
    ...HAIR_CAP,
    p([LO - OUT, LO - 0.4, HI - 0.8], [HI + OUT, h(4.5), HI + OUT], 'haar', 0),
    ...braid(LO + 0.8, -1),
    ...braid(HI - 3.2, 1),
  ],
  bun: [
    ...HAIR_CAP,
    p([5.6, HI - 2.4, HI + OUT], [10.4, HI + 2.4, HI + 4.4], 'haar', 0), // Dutt am Hinterkopf
    p([6.4, HI - 1.6, HI + 4.4], [9.6, HI + 1.6, HI + 5.2], 'haar', 0),
    p([4.8, HI + 0.4, HI + 2], [11.2, HI + 0.8, HI + 2.4], 'band', 1), // Haarnadel
  ],
};

/** Bart: Schnurrbart und Vollbart vor dem Gesicht (Farbe 0). */
const BEARD: readonly Part[] = [
  p([h(2), h(2.4), LO - OUT], [h(6), h(3), LO], 'haar', 0), // Schnurrbart
  p([h(1), LO - 0.8, LO - OUT], [h(7), h(2.4), LO], 'haar', 0), // Kinn
  p([LO - OUT, LO - 0.4, LO - OUT], [h(1), h(4), LO + 4], 'haar', 0), // Koteletten
  p([h(7), LO - 0.4, LO - OUT], [HI + OUT, h(4), LO + 4], 'haar', 0),
];

/** Hüte: Farbe 0 = Hut, Farbe 1 = Band/Zierde. */
const HATS: Readonly<Record<string, readonly Part[]>> = {
  tyrol: [
    p([LO - 2.4, HI + 0.8, LO - 2.4], [HI + 2.4, HI + 1.6, HI + 2.4], 'filz', 0), // Krempe
    p([LO - 0.4, HI + 1.6, LO + 0.4], [HI + 0.4, HI + 6.4, HI - 0.4], 'filz', 0), // Kopf
    p([LO + 1.2, HI + 6.4, LO + 2.4], [HI - 1.2, HI + 7.2, HI - 2.4], 'filz', 0),
    p([LO - 0.6, HI + 1.6, LO + 0.2], [HI + 0.6, HI + 2.6, HI - 0.2], 'band', 1), // Hutband
    p([HI - 0.6, HI + 2, 8], [HI + 1, HI + 9, 10.4], 'feder', undefined, {
      angle: -22.5,
      axis: 'z',
      origin: [HI, HI + 2, 9],
    }), // Gamsbart
  ],
  straw: [
    p([LO - 4, HI + 0.8, LO - 4], [HI + 4, HI + 1.4, HI + 4], 'stroh'),
    p([LO, HI + 1.4, LO], [HI, HI + 5.6, HI], 'stroh'),
    p([LO - 0.2, HI + 1.4, LO - 0.2], [HI + 0.2, HI + 2.6, HI + 0.2], 'band', 0),
  ],
  chef: [
    p([LO - 0.4, HI - 0.4, LO - 0.4], [HI + 0.4, HI + 2.4, HI + 0.4], 'stoff', 0),
    p([LO - 1.6, HI + 2.4, LO - 1.6], [HI + 1.6, HI + 8.8, HI + 1.6], 'stoff', 0),
  ],
  beanie: [
    p([LO - 0.8, h(5.5), LO - 0.8], [HI + 0.8, HI + 1.6, HI + 0.8], 'filz', 0),
    p([LO - 1, h(5.5), LO - 1], [HI + 1, h(6.5), HI + 1], 'filz', 1),
    p([6.4, HI + 1.6, 6.4], [9.6, HI + 4, 9.6], 'filz', 1), // Bommel
  ],
  cap: [
    p([LO - 0.6, HI - 1.2, LO - 0.6], [HI + 0.6, HI + 1.6, HI + 0.6], 'filz', 0),
    p([LO, HI - 1.2, LO - 5.6], [HI, HI - 0.4, LO - 0.6], 'filz', 1), // Schirm
  ],
  scarf: [
    p([LO - 0.8, h(4), LO + 2], [HI + 0.8, HI + 0.8, HI + 0.8], 'stoff', 0), // Kopftuch
    p([LO - 0.8, HI, LO - 0.8], [HI + 0.8, HI + 0.8, LO + 2], 'stoff', 0),
    p([6.4, h(3), HI + 0.8], [9.6, h(5), HI + 2.4], 'stoff', 1), // Knoten
  ],
  crown: [
    p([LO - 0.4, HI, LO - 0.4], [HI + 0.4, HI + 2.4, HI + 0.4], 'metall', 0),
    ...[LO - 0.4, 7, HI - 1.2].flatMap((x) => [
      p([x, HI + 2.4, LO - 0.4], [x + 1.6, HI + 4.8, LO + 1.2], 'metall', 0),
      p([x, HI + 2.4, HI - 1.2], [x + 1.6, HI + 4.8, HI + 0.4], 'metall', 0),
    ]),
  ],
  party: [
    p([LO + 1.6, HI, LO + 1.6], [HI - 1.6, HI + 3.2, HI - 1.6], 'stoff', 0),
    p([LO + 3.6, HI + 3.2, LO + 3.6], [HI - 3.6, HI + 6.4, HI - 3.6], 'stoff', 1),
    p([7.2, HI + 6.4, 7.2], [8.8, HI + 8, 8.8], 'stoff', 0),
  ],
  helmet: [
    p([LO - 0.8, h(3.5), LO - 0.8], [HI + 0.8, HI + 1.2, HI + 0.8], 'metall', 0),
    p([7.2, HI + 1.2, LO - 0.8], [8.8, HI + 2.4, HI + 0.8], 'metall', 1), // Kamm
  ],
  hood: [
    p([LO - 1.2, LO - 0.8, LO + 1.6], [HI + 1.2, HI + 1.2, HI + 1.6], 'stoff', 0),
    p([LO - 1.2, h(6), LO - 1.2], [HI + 1.2, HI + 1.2, LO + 1.6], 'stoff', 0),
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Körper: Modellraum = Skin-Pixel, Füße bei 0, Körper x 4…12 / z 6…10 / y 12…24, Beine y 0…12, vorne = z klein.
// ---------------------------------------------------------------------------------------------------------------

/** Rock: in Stufen weiter werdend (Farbe 0). */
const ROCK: readonly Part[] = [
  p([3.5, 10, 5.5], [12.5, 12.6, 10.5], 'stoff', 0),
  p([3, 7, 5], [13, 10, 11], 'stoff', 0),
  p([2.5, 4.4, 4.5], [13.5, 7, 11.5], 'stoff', 0),
  p([2.2, 3.4, 4.2], [13.8, 4.4, 11.8], 'stoff', 0), // Saum
];
/** Schürze vorne auf dem Rock, Bund rundherum und Schleife (Farbe 0). */
const SCHUERZE: readonly Part[] = [
  p([5, 10, 5.25], [11, 12.4, 5.5], 'schuerze', 0),
  p([5, 7, 4.75], [11, 10, 5], 'schuerze', 0),
  p([5, 4.2, 4.25], [11, 7, 4.5], 'schuerze', 0),
  p([3.7, 12.2, 5.7], [12.3, 12.9, 10.3], 'schuerze', 0), // Bund
  p([10.4, 11.4, 5.1], [12, 13, 5.7], 'schuerze', 0), // Schleife rechts vorne
];
/**
 * Mieder (Farbe 0) mit Schnürung (Farbe 1) und Bluse am Ausschnitt (Farbe 2). Die Brust ist nur angedeutet: zwei
 * flache Rundungen, oben in der Bluse.
 */
const MIEDER: readonly Part[] = [
  p([3.7, 12.6, 5.7], [12.3, 19, 10.3], 'stoff', 0),
  p([4.6, 17, 5.0], [7.7, 18.7, 5.7], 'stoff', 0),
  p([8.3, 17, 5.0], [11.4, 18.7, 5.7], 'stoff', 0),
  p([4.8, 18.7, 5.2], [7.5, 19.8, 5.7], 'stoff', 2),
  p([8.5, 18.7, 5.2], [11.2, 19.8, 5.7], 'stoff', 2),
  p([3.7, 19, 5.6], [12.3, 20.4, 10.3], 'stoff', 2), // Bluse oben
  p([7.6, 13, 5.5], [8.4, 17, 5.65], 'schnuerung', 1),
];
/** Hosenträger mit Steg (Farbe 0). */
const HOSENTRAEGER: readonly Part[] = [
  p([5, 12, 5.65], [6.2, 24, 5.85], 'band', 0),
  p([9.8, 12, 5.65], [11, 24, 5.85], 'band', 0),
  p([5, 19, 5.5], [11, 20.2, 5.7], 'band', 0),
  p([5, 12, 10.15], [6.2, 24, 10.35], 'band', 0),
  p([9.8, 12, 10.15], [11, 24, 10.35], 'band', 0),
  p([6.2, 21, 10.15], [9.8, 22, 10.35], 'band', 0),
];
/** Trachtenweste (Farbe 0) mit Knöpfen (Farbe 1); vorne offen. */
const WESTE: readonly Part[] = [
  p([3.7, 13, 9.7], [12.3, 24.2, 10.4], 'filz', 0), // Rücken
  p([3.6, 13, 5.6], [4.3, 24.2, 10.4], 'filz', 0), // Seiten
  p([11.7, 13, 5.6], [12.4, 24.2, 10.4], 'filz', 0),
  p([3.6, 13, 5.5], [7.4, 24.2, 6.2], 'filz', 0), // Vorderteile
  p([8.6, 13, 5.5], [12.4, 24.2, 6.2], 'filz', 0),
  ...[15, 17.5, 20].map((y) => p([6.3, y, 5.3], [7.1, y + 0.8, 5.5], 'metall', 1)),
];

const BODY_PARTS = {
  rock: ROCK,
  schuerze: SCHUERZE,
  mieder: MIEDER,
  hosentraeger: HOSENTRAEGER,
  weste: WESTE,
};
export type BodyPart = keyof typeof BODY_PARTS;
const BODY_ORDER: readonly BodyPart[] = ['rock', 'schuerze', 'mieder', 'hosentraeger', 'weste'];
/** Wie viele Farben jedes Körperteil braucht (sie liegen hintereinander in `custom_model_data`). */
const BODY_COLOURS: Readonly<Record<BodyPart, number>> = {
  rock: 1,
  schuerze: 1,
  mieder: 3,
  hosentraeger: 1,
  weste: 2,
};

// ---------------------------------------------------------------------------------------------------------------
// Was eine Figur trägt
// ---------------------------------------------------------------------------------------------------------------

export interface TrachtItems {
  /** Gegenstand für den Kopf-Platz (Frisur, Bart, Hut) – null, wenn es nichts zu zeigen gibt. */
  readonly head: string | null;
  /** Gegenstand für das Anzeige-Objekt am Körper – null ohne Kleidungsteil. */
  readonly body: string | null;
}

const HAIR_SLOT = 0;
const HAT_SLOT = 1;
const BEARD_SLOT = 2;
const NONE = '-';
const SNBT_COLOUR = (c: number): string => `${c | 0}`;

function itemSnbt(strings: readonly string[], colours: readonly number[]): string {
  const s = strings.map((t) => `'${t}'`).join(',');
  const c = colours.map(SNBT_COLOUR).join(',');
  return `{id:'minecraft:paper',count:1,components:{'minecraft:item_model':'minecraft:air','minecraft:custom_model_data':{strings:[${s}],colors:[${c}]}}}`;
}

/** Welche Körperteile eine Tracht hat. */
export function bodyParts(o: Outfit): BodyPart[] {
  const skirt = o.bottom.kind === 'skirt';
  return BODY_ORDER.filter((part) => {
    const has: Readonly<Record<BodyPart, boolean>> = {
      rock: skirt,
      schuerze: skirt && o.apron !== undefined,
      mieder: o.bodice !== undefined,
      hosentraeger: o.braces !== undefined,
      weste: o.vest !== undefined,
    };
    return has[part];
  });
}

/** Die Gegenstände (als SNBT) für eine Figur. `seated`: Körper weglassen (sitzend passt der Rock nicht). */
export function trachtItems(o: Outfit, seated = false): TrachtItems {
  const hair = o.hairStyle === 'bald' ? NONE : o.hairStyle;
  const hat = o.hat && HATS[o.hat.kind] ? o.hat.kind : NONE;
  const beard = o.beard === undefined ? NONE : 'bart';
  const ribbon = o.bodice?.lacing ?? o.apron ?? 0xb02a2a;
  const head =
    hair === NONE && hat === NONE && beard === NONE
      ? null
      : itemSnbt(
          [hair, hat, beard],
          [o.hair, o.hat?.colour ?? 0, o.hat?.accent ?? ribbon, o.beard ?? o.hair, ribbon],
        );
  const parts = seated ? [] : bodyParts(o);
  const colourOf: Readonly<Record<BodyPart, readonly number[]>> = {
    rock: [o.bottom.colour],
    schuerze: [o.apron ?? 0xffffff],
    mieder: [o.bodice?.colour ?? 0, o.bodice?.lacing ?? 0xffffff, o.top.colour],
    hosentraeger: [o.braces ?? 0],
    weste: [o.vest ?? 0, 0xd8c070],
  };
  const body =
    parts.length === 0
      ? null
      : itemSnbt(
          BODY_ORDER.map((part) => (parts.includes(part) ? part : NONE)),
          BODY_ORDER.flatMap((part) => colourOf[part]),
        );
  return { head, body };
}

/** Wo die Farben eines Körperteils in der Liste beginnen. */
function bodyColourStart(part: BodyPart): number {
  return BODY_ORDER.slice(0, BODY_ORDER.indexOf(part)).reduce((sum, q) => sum + BODY_COLOURS[q], 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Ressourcenpaket: Modelle, Texturen, items/air.json
// ---------------------------------------------------------------------------------------------------------------

function element(part: Part): Record<string, unknown> {
  return {
    from: part.from,
    to: part.to,
    ...(part.rotation ? { rotation: part.rotation } : {}),
    faces: Object.fromEntries(
      FACES.map((f) => [
        f,
        {
          uv: [0, 0, 16, 16],
          texture: `#${part.tex}`,
          ...(part.tint === undefined ? {} : { tintindex: part.tint }),
        },
      ]),
    ),
  };
}

function modelOf(parts: readonly Part[]): Record<string, unknown> {
  const used = [...new Set(parts.map((q) => q.tex))];
  return {
    textures: {
      particle: `${TRACHT_NS}:item/tracht/${used[0] ?? 'stoff'}`,
      ...Object.fromEntries(used.map((t) => [t, `${TRACHT_NS}:item/tracht/${t}`])),
    },
    elements: parts.map(element),
  };
}

/** Alle Modelle: Name → Modell-JSON (unter `models/item/tracht/`). */
export function trachtModels(): Record<string, Record<string, unknown>> {
  return {
    ...Object.fromEntries(Object.entries(HAIR).map(([k, v]) => [`haar_${k}`, modelOf(v)])),
    bart: modelOf(BEARD),
    ...Object.fromEntries(Object.entries(HATS).map(([k, v]) => [`hut_${k}`, modelOf(v)])),
    ...Object.fromEntries(Object.entries(BODY_PARTS).map(([k, v]) => [`koerper_${k}`, modelOf(v)])),
  };
}

const model = (name: string): string => `${TRACHT_NS}:item/tracht/${name}`;
const AIR = 'minecraft:item/air';
const cmdTint = (index: number): Record<string, unknown> => ({
  type: 'minecraft:custom_model_data',
  index,
  default: -1,
});
const empty = { type: 'minecraft:model', model: AIR };

/** Auswahl über einen Text in `custom_model_data`, Farben aus `colours` (Index je `tintindex`). */
function selectPart(
  index: number,
  cases: Record<string, string>,
  colours: readonly number[],
): Record<string, unknown> {
  return {
    type: 'minecraft:select',
    property: 'minecraft:custom_model_data',
    index,
    cases: Object.entries(cases).map(([when, name]) => ({
      when,
      model: { type: 'minecraft:model', model: model(name), tints: colours.map(cmdTint) },
    })),
    fallback: empty,
  };
}

/**
 * `assets/minecraft/items/air.json`: Kopf-Teile (Frisur, Hut, Bart) oder Körper-Teile, je nach erstem Text; sonst leer
 * wie in Minecraft.
 */
export function airItemDefinition(): Record<string, unknown> {
  const hairCases = Object.fromEntries(Object.keys(HAIR).map((k) => [k, `haar_${k}`]));
  const hatCases = Object.fromEntries(Object.keys(HATS).map((k) => [k, `hut_${k}`]));
  const head = {
    type: 'minecraft:composite',
    models: [
      selectPart(HAIR_SLOT, hairCases, [0, 4]),
      selectPart(HAT_SLOT, hatCases, [1, 2]),
      selectPart(BEARD_SLOT, { bart: 'bart' }, [3]),
    ],
  };
  const body = {
    type: 'minecraft:composite',
    models: BODY_ORDER.map((part, i) =>
      selectPart(
        i,
        { [part]: `koerper_${part}` },
        Array.from({ length: BODY_COLOURS[part] }, (_, k) => bodyColourStart(part) + k),
      ),
    ),
  };
  // Kopf-Gegenstände haben drei Texte, Körper-Gegenstände fünf: Gibt es einen vierten Text, ist es der Körper.
  return {
    model: {
      type: 'minecraft:select',
      property: 'minecraft:custom_model_data',
      index: 3,
      cases: [{ when: [...BODY_ORDER.slice(3), NONE], model: body }],
      fallback: head,
    },
  };
}

/** Eigene Texturen: hell, damit die Farbe der Figur durchkommt. */
export function trachtTextures(): Record<TexName, Buffer> {
  const pic = (draw: (x: number, y: number, r: () => number) => number, seed: number): Buffer => {
    const img = new Picture(16, 16);
    const r = random(seed);
    Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => img.set(x, y, draw(x, y, r))));
    return img.png();
  };
  const grey = (v: number): number => {
    const c = Math.max(0, Math.min(255, Math.round(v)));
    return (c << 16) | (c << 8) | c;
  };
  const strands = Array.from({ length: 16 }, (_, x) => 200 + ((x * 37) % 5) * 9);
  return {
    // Haare: senkrechte Strähnen
    haar: pic((x, y, r) => grey(strands[x]! - (y % 5 === 0 ? 18 : 0) + r() * 14), 11),
    // Filz: ruhig mit leichtem Rauschen
    filz: pic((_x, _y, r) => grey(205 + r() * 22), 12),
    // Stroh: gelbliches Geflecht (nicht eingefärbt)
    stroh: pic((x, y, r) => {
      const weave = (x + y) % 4 < 2 ? 0 : -24;
      const v = 215 + weave + r() * 16;
      return (Math.round(v) << 16) | (Math.round(v * 0.86) << 8) | Math.round(v * 0.52);
    }, 13),
    // Stoff: feines Gewebe
    stoff: pic((x, y, r) => grey(225 - ((x + y) % 2) * 10 + r() * 10), 14),
    // Schürze: zartes Karo
    schuerze: pic((x, y, r) => grey(236 - (x % 4 === 0 || y % 4 === 0 ? 26 : 0) + r() * 8), 15),
    // Schnürung: Zickzack auf hellem Grund
    schnuerung: pic((x, y) => grey(Math.abs((y % 4) - x / 4) < 1 ? 250 : 120), 16),
    // Gamsbart: dunkel mit hellen Spitzen (nicht eingefärbt)
    feder: pic((x, y, r) => grey((y < 4 ? 210 : 70) + r() * 30 - (x % 3 === 0 ? 20 : 0)), 17),
    metall: pic((x, y, r) => grey(230 - (x === 0 || y === 0 ? 40 : 0) + r() * 12), 18),
    band: pic((_x, y, r) => grey(232 - (y % 3 === 0 ? 30 : 0) + r() * 8), 19),
  };
}
