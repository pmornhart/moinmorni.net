/* eslint-disable ts-patterns/no-magic-numbers -- Modell-Maße in 1/16 Block (Minecraft-Modellkoordinaten) */
import type { Canvas } from './canvas.js';
import { zipOf } from './png.js';
import { airItemDefinition, TRACHT_NS, trachtModels, trachtTextures } from './trachten.js';
import { BRUNNEN_ERSATZ, brunnenItemCases, brunnenModels } from './brunnen.js';
import { STEP, type Facing } from './shapes.js';

/**
 * Möbel der Lobby als eigene 3D-Modelle (Ressourcenpaket).
 *
 * Statt frei schwebender Anzeige-Objekte (die Bedrock über Geyser nicht zeigt) bekommen ein paar Holzblöcke, die es in
 * der Lobby **nur als Möbel** gibt, eine neue Form:
 *
 * - Mangrove-Stufen → Wirtshausstuhl mit Herz in der Lehne (Richtung = Lehne); gerade Stufe an der Wand → Eckbank
 *   mit Vertäfelung (deckt die Wandfläche ab, die Minecraft hinter einer Stufe ausblendet)
 * - Mangrove-Halbstufe oben → Wirtshaustisch, unten → Hocker
 * - Birken-Halbstufe oben → Biertisch, unten → Bierbank (beide längs der x-Achse, wie im Biergarten)
 * - Braune Kerzen (1–4) → 1–4 Steinkrüge auf dem Tisch
 *
 * Wer das Paket nicht lädt (oder auf Bedrock spielt), sieht die normalen Blöcke – Stufen, Halbstufen, Kerzen – wie
 * vorher, nur in Mangrove/Birke. Die Blöcke bleiben echte Blöcke: man läuft nicht hindurch, Figuren sitzen wie bisher.
 *
 * Die Modelle nutzen nur Texturen, die jedes Minecraft schon mitbringt (Holz, Ton, Eisen); im Paket stehen nur unsere
 * eigenen Formen – keine Dateien von Mojang.
 */

type Vec = readonly [number, number, number];
type Axis = 'x' | 'y' | 'z';
type Face = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

/** Texturen aus dem Spiel selbst (nur Verweise). */
const TEXTURES = {
  brett: 'minecraft:block/stripped_spruce_log',
  holz: 'minecraft:block/spruce_planks',
  dunkel: 'minecraft:block/dark_oak_planks',
  hell: 'minecraft:block/birch_planks',
  metall: 'minecraft:block/iron_block',
  ton: 'minecraft:block/clay',
  blau: 'minecraft:block/blue_terracotta',
  dielen: 'minecraft:block/spruce_planks',
  kies: 'minecraft:block/gravel',
} as const;
type Tex = keyof typeof TEXTURES;

interface Box {
  readonly from: Vec;
  readonly to: Vec;
  readonly tex: Tex;
  readonly rotation?: { readonly angle: number; readonly axis: Axis; readonly origin: Vec };
}

const FACES: readonly Face[] = ['north', 'south', 'east', 'west', 'up', 'down'];
const BLOCK = 16;

const box = (from: Vec, to: Vec, tex: Tex, rotation?: Box['rotation']): Box => ({
  from,
  to,
  tex,
  ...(rotation ? { rotation } : {}),
});

/** Ausschnitt der Textur passend zur Lage der Fläche, immer innerhalb 0..16 (auch über den Block hinaus). */
function uvOf(b: Box, face: Face): [number, number, number, number] {
  const [x1, y1, z1] = b.from;
  const [x2, y2, z2] = b.to;
  const span: Readonly<Record<Face, [number, number, number, number]>> = {
    north: [BLOCK - x2, BLOCK - y2, BLOCK - x1, BLOCK - y1],
    south: [x1, BLOCK - y2, x2, BLOCK - y1],
    east: [BLOCK - z2, BLOCK - y2, BLOCK - z1, BLOCK - y1],
    west: [z1, BLOCK - y2, z2, BLOCK - y1],
    up: [x1, z1, x2, z2],
    down: [x1, BLOCK - z2, x2, BLOCK - z1],
  };
  const [u1, v1, u2, v2] = span[face];
  const shift = (a: number, b2: number): number => {
    const low = Math.min(a, b2);
    const high = Math.max(a, b2);
    if (low < 0) return -Math.floor(low / BLOCK) * BLOCK;
    if (high > BLOCK) return -Math.ceil((high - BLOCK) / BLOCK) * BLOCK;
    return 0;
  };
  const du = shift(u1, u2);
  const dv = shift(v1, v2);
  return [u1 + du, v1 + dv, u2 + du, v2 + dv];
}

function element(b: Box): Record<string, unknown> {
  // Eine flache Fläche (Boden) hat nur eine Seite: oben.
  const faces = b.from[1] === b.to[1] ? (['up'] as const) : FACES;
  return {
    from: b.from,
    to: b.to,
    ...(b.rotation ? { rotation: b.rotation } : {}),
    faces: Object.fromEntries(faces.map((f) => [f, { uv: uvOf(b, f), texture: `#${b.tex}` }])),
  };
}

/**
 * Stufen und untere Halbstufen haben unten eine volle Fläche – Minecraft zeichnet darum die Oberseite des Bodens
 * darunter nicht (man sähe durch den Boden). Das Modell zeichnet sie selbst: Fichtendielen in den Häusern, Kies im
 * Biergarten (die Lobby legt genau diesen Boden unter die Möbel, ein Test prüft das).
 */
const boden = (tex: 'dielen' | 'kies'): Box => box([0, 0, 0], [16, 0, 16], tex);

/** Block-Modell im Minecraft-Format; nur die Texturen, die es wirklich benutzt. */
export function modelJson(boxes: readonly Box[]): Record<string, unknown> {
  const used = [...new Set(boxes.map((b) => b.tex))];
  const first = used[0] ?? 'holz';
  return {
    textures: {
      particle: TEXTURES[first],
      ...Object.fromEntries(used.map((t) => [t, TEXTURES[t]])),
    },
    elements: boxes.map(element),
  };
}

/**
 * Bild aus Zeilen (`#` = Holz, `.` = frei) als waagerechte Leisten: so entsteht z. B. die Stuhllehne mit Herz.
 * `x0`/`top` = linke obere Ecke, eine Zeile/Spalte = `px` Pixel, `z` = Vorder- und Rückseite.
 */
function fromMask(
  rows: readonly string[],
  x0: number,
  top: number,
  z: readonly [number, number],
  tex: Tex,
  px = 1,
  rotation?: Box['rotation'],
): Box[] {
  return rows.flatMap((row, r) => {
    // Zusammenhängendes Holz in einer Zeile: "##..###" → "##" und "###"; "...." (nur frei) → nichts.
    // https://regex101.com/?flavor=javascript&regex=%23%2B&flags=g&testString=%23%23..%23%23%23
    const runs = [...row.matchAll(/#+/g)];
    return runs.map((m) => {
      const start = m.index ?? 0;
      return box(
        [x0 + start * px, top - (r + 1) * px, z[0]],
        [x0 + (start + m[0].length) * px, top - r * px, z[1]],
        tex,
        rotation,
      );
    });
  });
}

/** Lehne des Wirtshausstuhls (11 × 12 Pixel) mit Herz in der Mitte – Brettlstuhl wie im bayerischen Wirtshaus. */
const BACKREST = [
  '..#######..',
  '.#########.',
  '###########',
  '###########',
  '####.#.####',
  '###.....###',
  '####...####',
  '#####.#####',
  '###########',
  '.#########.',
  '.#########.',
  '..#######..',
];

/** Lehne leicht nach hinten geneigt (um die Unterkante gedreht). */
const LEAN: Box['rotation'] = { angle: -22.5, axis: 'x', origin: [8, 8, 2.25] };

/** Stuhl, Lehne im Norden (Drehung je Richtung über den Blockzustand). */
export const STUHL: readonly Box[] = [
  boden('dielen'),
  box([2, 6.5, 2], [14, 8, 14], 'brett'),
  box([3, 0, 3], [5, 6.5, 5], 'dunkel'),
  box([11, 0, 3], [13, 6.5, 5], 'dunkel'),
  box([3, 0, 11], [5, 6.5, 13], 'dunkel'),
  box([11, 0, 11], [13, 6.5, 13], 'dunkel'),
  ...fromMask(BACKREST, 2.5, 20, [1.5, 3], 'brett', 1, LEAN),
];

/**
 * Eckbank-Stück, Rückwand im Norden: geschlossener Sockel, Sitz, Lehne und Vertäfelung bis unter die Decke des Blocks.
 * Die Vertäfelung füllt die ganze Rückseite – genau die Wandfläche, die Minecraft hinter der Stufe nicht zeichnet.
 */
export const ECKBANK: readonly Box[] = [
  boden('dielen'),
  box([0, 0, 0], [16, 16, 1], 'brett'),
  box([0, 15, 0], [16, 16, 2.5], 'dunkel'),
  box([0, 8, 1], [16, 14, 2], 'holz'),
  box([0, 6.5, 1], [16, 8, 13], 'brett'),
  box([0, 6, 12], [16, 8, 13], 'dunkel'),
  box([0, 0, 2], [16, 6.5, 12], 'dunkel'),
];

/** Wirtshaustisch: dicke Platte bündig oben, Zarge, Mittelfuß mit Kreuz (gleich aus jeder Richtung). */
export const WIRTSTISCH: readonly Box[] = [
  box([0, 14, 0], [16, 16, 16], 'holz'),
  box([1, 12.5, 1], [15, 14, 15], 'dunkel'),
  box([6, 1, 6], [10, 12.5, 10], 'dunkel'),
  box([2, 0, 6.5], [14, 1.5, 9.5], 'dunkel'),
  box([6.5, 0, 2], [9.5, 1.5, 14], 'dunkel'),
];

/** Hocker: Sitz mit abgeschrägten Ecken, vier Beine. */
export const HOCKER: readonly Box[] = [
  boden('dielen'),
  box([4, 6.5, 3], [12, 8, 13], 'brett'),
  box([3, 6.5, 4], [13, 8, 12], 'brett'),
  box([4.5, 0, 4.5], [6, 6.5, 6], 'dunkel'),
  box([10, 0, 4.5], [11.5, 6.5, 6], 'dunkel'),
  box([4.5, 0, 10], [6, 6.5, 11.5], 'dunkel'),
  box([10, 0, 10], [11.5, 6.5, 11.5], 'dunkel'),
];

/** Bierbank längs x: schmale Sitzfläche, Klappbein aus Metall in der Mitte jedes Blocks. */
export const BIERBANK: readonly Box[] = [
  boden('kies'),
  box([0, 6.5, 5], [16, 8, 11], 'holz'),
  box([0, 5.5, 5.5], [16, 6.5, 6.5], 'dunkel'),
  box([0, 5.5, 9.5], [16, 6.5, 10.5], 'dunkel'),
  box([7.25, 0, 5.5], [8.75, 5.5, 6.5], 'metall'),
  box([7.25, 0, 9.5], [8.75, 5.5, 10.5], 'metall'),
  box([7.25, 0, 5], [8.75, 1, 11], 'metall'),
];

/** Biertisch längs x: Platte bündig oben (Krüge stehen darauf), Klappbein aus Metall in der Mitte jedes Blocks. */
export const BIERTISCH: readonly Box[] = [
  box([0, 14.5, 2], [16, 16, 14], 'holz'),
  box([0, 13.5, 3], [16, 14.5, 4], 'dunkel'),
  box([0, 13.5, 12], [16, 14.5, 13], 'dunkel'),
  box([7.25, 0, 3.5], [8.75, 13.5, 4.5], 'metall'),
  box([7.25, 0, 11.5], [8.75, 13.5, 12.5], 'metall'),
  box([7.25, 0, 3], [8.75, 1, 13], 'metall'),
  box([7.25, 7, 4.5], [8.75, 8, 11.5], 'metall'),
];

/** Ein Steinkrug (grauer Ton, blaues Band, Zinndeckel, Henkel nach Osten) mit Mitte (cx, cz). */
function steinkrug(cx: number, cz: number): Box[] {
  return [
    box([cx - 1.5, 0, cz - 1.5], [cx + 1.5, 5, cz + 1.5], 'ton'),
    box([cx - 1.55, 3.5, cz - 1.55], [cx + 1.55, 4, cz + 1.55], 'blau'),
    box([cx - 1.75, 5, cz - 1.75], [cx + 1.75, 5.5, cz + 1.75], 'metall'),
    box([cx - 0.5, 5.5, cz + 0.75], [cx + 0.5, 6, cz + 1.75], 'metall'),
    box([cx + 1.5, 1, cz - 0.5], [cx + 2.5, 1.5, cz + 0.5], 'ton'),
    box([cx + 2, 1.5, cz - 0.5], [cx + 2.5, 4, cz + 0.5], 'ton'),
    box([cx + 1.5, 4, cz - 0.5], [cx + 2.5, 4.5, cz + 0.5], 'ton'),
  ];
}

/** Wo die Krüge stehen, je nach Anzahl (wie Kerzen: 1 bis 4). */
const KRUG_PLAETZE: readonly (readonly (readonly [number, number])[])[] = [
  [[7, 8]],
  [
    [4.5, 8],
    [10, 8],
  ],
  [
    [4, 5.5],
    [10, 5.5],
    [7, 11],
  ],
  [
    [4, 4.5],
    [10, 4.5],
    [4, 11],
    [10, 11],
  ],
];

export const KRUEGE: readonly (readonly Box[])[] = KRUG_PLAETZE.map((places) =>
  places.flatMap(([x, z]) => steinkrug(x, z)),
);

/** Alle Möbel-Modelle: Name im Paket → Teile. */
export const FURNITURE_MODELS: Readonly<Record<string, readonly Box[]>> = {
  stuhl: STUHL,
  eckbank: ECKBANK,
  wirtstisch: WIRTSTISCH,
  hocker: HOCKER,
  bierbank: BIERBANK,
  biertisch: BIERTISCH,
  ...Object.fromEntries(KRUEGE.map((k, i) => [`krug_${i + 1}`, k])),
};

const NS = 'moinmorni';
const model = (name: string): string => `${NS}:block/moebel/${name}`;

/**
 * Feste Kennung des Pakets (server.properties `resource-pack-id`): Der Proxy entfernt genau dieses Paket wieder, wenn
 * jemand die Lobby verlässt – sonst wären z. B. in MorniCraft Mangrove-Stufen plötzlich Stühle. Gleicher Wert in
 * `VelocityPlugin.java`.
 */
export const MOEBEL_PACK_ID = '6d6f696e-6d6f-726e-692d-6d6f6562656c';

/** Boden, der unter Stuhl/Hocker bzw. Bierbank liegen muss (das Modell zeichnet ihn mit). */
export const MOEBEL_BODEN = { haus: 'spruce_planks', biergarten: 'gravel' } as const;

/** Blöcke, die in der Lobby Möbel sind – zum Bauen (Richtung des Stuhls = wo die Lehne ist). */
export const MOEBEL = {
  /**
   * Freistehender Stuhl; `lehne` = Himmelsrichtung oder ein Platzhalter der Häuser ({F}, {B} …). Als Ecken-Stufe hat
   * er keine volle Seitenfläche – Nachbarn bleiben sichtbar. Steht er mit der Lehne an einer Wand, macht
   * `fitFurniture` eine Eckbank daraus.
   */
  stuhl: (lehne: string): string => `mangrove_stairs[facing=${lehne},half=bottom,shape=outer_right]`,
  /** Eckbank-Stück mit Vertäfelung, Rückwand an `lehne`. */
  eckbank: (lehne: string): string => `mangrove_stairs[facing=${lehne},half=bottom,shape=straight]`,
  wirtstisch: 'mangrove_slab[type=top]',
  hocker: 'mangrove_slab[type=bottom]',
  bierbank: 'birch_slab[type=bottom]',
  biertisch: 'birch_slab[type=top]',
  krug: (anzahl: 1 | 2 | 3 | 4): string => `brown_candle[candles=${anzahl},lit=false]`,
} as const;

const FACINGS = ['north', 'east', 'south', 'west'] as const;
const HALVES = ['bottom', 'top'] as const;
const SHAPES = ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'] as const;
const QUARTER = 90;

/**
 * Blockzustände der Möbel-Blöcke. Untere Stufen gerade oder als Innenecke sind Eckbank-Stücke (Innenecken entstehen,
 * wenn Minecraft die Form einer Bank an der Ecke neu berechnet), Außenecken und obere Stufen sind Stühle; doppelte
 * Halbstufen bleiben normales Holz.
 */
export function furnitureBlockstates(): Readonly<Record<string, unknown>> {
  const chair = Object.fromEntries(
    FACINGS.flatMap((facing, i) =>
      HALVES.flatMap((half) =>
        SHAPES.map((shape) => [
          `facing=${facing},half=${half},shape=${shape}`,
          {
            model: model(half === 'bottom' && !shape.startsWith('outer') ? 'eckbank' : 'stuhl'),
            ...(i ? { y: i * QUARTER } : {}),
          },
        ]),
      ),
    ),
  );
  const candles = Object.fromEntries(
    KRUEGE.flatMap((_, i) =>
      [false, true].map((lit) => [`candles=${i + 1},lit=${lit}`, { model: model(`krug_${i + 1}`) }]),
    ),
  );
  return {
    mangrove_stairs: { variants: chair },
    mangrove_slab: {
      variants: {
        'type=top': { model: model('wirtstisch') },
        'type=bottom': { model: model('hocker') },
        'type=double': { model: 'minecraft:block/mangrove_planks' },
      },
    },
    birch_slab: {
      variants: {
        'type=top': { model: model('biertisch') },
        'type=bottom': { model: model('bierbank') },
        'type=double': { model: 'minecraft:block/birch_planks' },
      },
    },
    brown_candle: { variants: candles },
  };
}

/** Leeres Block-Modell (nur Bruch-Partikel): für Blöcke, die das Paket ausblendet. */
const EMPTY_MODEL = { textures: { particle: 'minecraft:block/quartz_block_side' }, elements: [] };

/**
 * Ersatz-Blöcke des Prunkbrunnens (Tuffziegel-Mauer, Endstab) – mit Paket unsichtbar, dort steht das Modell. Beide
 * haben keine volle Seitenfläche: Minecraft lässt die Flächen daneben stehen, es entstehen keine Löcher.
 */
function hiddenBlockstates(): Readonly<Record<string, unknown>> {
  const hidden = { multipart: [{ apply: { model: `${NS}:block/leer` } }] };
  return Object.fromEntries(
    Object.values(BRUNNEN_ERSATZ).map((block) => [block.split('[')[0] ?? block, hidden]),
  );
}

/** `items/air.json`: erster Text „brunnen“ → Teil des Prunkbrunnens, sonst wie bisher (Trachten). */
function airWithFountain(): Record<string, unknown> {
  const trachten = airItemDefinition() as { readonly model: unknown };
  return {
    model: {
      type: 'minecraft:select',
      property: 'minecraft:custom_model_data',
      index: 0,
      cases: [{ when: 'brunnen', model: brunnenItemCases(NS) }],
      fallback: trachten.model,
    },
  };
}

/** Texturpaket-Bereich (Minecraft liest `pack_format` bzw. ab 1.21.9 `min_format`/`max_format`). */
const PACK_FORMAT = 15;
const PACK_FORMAT_MAX = 999;
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

/** Das Ressourcenpaket der Lobby als ZIP – gleiche Möbel = gleiche Bytes = gleiche SHA-1. */
export function furniturePack(): Buffer {
  const meta = {
    pack: {
      description: 'MoinMorni – Möbel, Trachten und Brunnen der Lobby',
      pack_format: PACK_FORMAT,
      supported_formats: { min_inclusive: PACK_FORMAT, max_inclusive: PACK_FORMAT_MAX },
      min_format: PACK_FORMAT,
      max_format: PACK_FORMAT_MAX,
    },
  };
  const states = { ...furnitureBlockstates(), ...hiddenBlockstates() };
  return zipOf([
    { name: 'pack.mcmeta', data: json(meta) },
    ...Object.keys(states)
      .sort()
      .map((block) => ({ name: `assets/minecraft/blockstates/${block}.json`, data: json(states[block]) })),
    ...Object.keys(FURNITURE_MODELS)
      .sort()
      .map((name) => ({
        name: `assets/${NS}/models/block/moebel/${name}.json`,
        data: json(modelJson(FURNITURE_MODELS[name] ?? [])),
      })),
    // Trachten und Prunkbrunnen über das (sonst leere) Luft-Modell, siehe trachten.ts und brunnen.ts
    { name: 'assets/minecraft/items/air.json', data: json(airWithFountain()) },
    { name: `assets/${NS}/models/block/leer.json`, data: json(EMPTY_MODEL) },
    ...Object.entries(brunnenModels())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, m]) => ({ name: `assets/${NS}/models/item/brunnen/${name}.json`, data: json(m) })),
    ...Object.entries(trachtModels())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, m]) => ({ name: `assets/${TRACHT_NS}/models/item/tracht/${name}.json`, data: json(m) })),
    ...Object.entries(trachtTextures())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, png]) => ({ name: `assets/${TRACHT_NS}/textures/item/tracht/${name}.png`, data: png })),
  ]);
}

// Blöcke ohne volle Seitenfläche (hinter ihnen braucht ein Stuhl keine Vertäfelung): "oak_slab[type=top]" ja,
// "stone_bricks" nein.
// https://regex101.com/?flavor=javascript&regex=_slab%7C_stairs%7C_pane%7C_fence%7Ccandle%7Ccarpet%7Clantern%7C_door%7Ctrapdoor%7Csign%7Cpotted%7Ctorch%7Cladder%7C_bars%7Cchain%7Cflower%7Cgrass%5Cb%7C%5Eair%24&testString=oak_slab%5Btype%3Dtop%5D
const PARTIAL =
  /_slab|_stairs|_pane|_fence|candle|carpet|lantern|_door|trapdoor|sign|potted|torch|ladder|_bars|chain|flower|grass\b|^air$/;

/** Hat dieser Block keine volle Seitenfläche (Luft, Halbstufe, Scheibe …)? */
export function isPartialBlock(block: string | undefined): boolean {
  return block === undefined || PARTIAL.test(block);
}

// Richtung der Lehne aus dem Blockzustand: "mangrove_stairs[facing=north,…]" → "north"; ohne facing → nichts.
// https://regex101.com/?flavor=javascript&regex=facing%3D(north%7Csouth%7Ceast%7Cwest)&testString=mangrove_stairs%5Bfacing%3Dnorth%2Chalf%3Dbottom%5D
const FACING = /facing=(north|south|east|west)/;

/**
 * Letzter Schritt beim Bauen: Stühle mit der Lehne an einer Wand werden Eckbank-Stücke (mit Vertäfelung), unter jede
 * Bierbank kommt Kies – auch wenn später noch ein Weg darüber gemalt wurde.
 */
export function fitFurniture(c: Canvas): void {
  c.find((b) => b.startsWith('mangrove_stairs[')).forEach(([x, y, z, b]) => {
    const facing = (FACING.exec(b)?.[1] ?? 'north') as Facing;
    const [dx, dz] = STEP[facing];
    const wall = !isPartialBlock(c.get(x + dx, y, z + dz));
    c.set(x, y, z, wall ? MOEBEL.eckbank(facing) : MOEBEL.stuhl(facing));
  });
  c.find((b) => b === MOEBEL.bierbank).forEach(([x, y, z]) => c.set(x, y - 1, z, MOEBEL_BODEN.biergarten));
}
